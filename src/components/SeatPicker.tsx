import { useEffect, useMemo, useState } from "react";

type SeatEstado = "available" | "held" | "reserved";

type SeatItem = {
  numero: number;
  estado: SeatEstado;
  expiresAt?: string;
};

type DisponiblesResponse = {
  ok: boolean;
  rutaId: number;
  fecha: string;
  ttlMs: number;
  asientos: SeatItem[];
  error?: string;
};

type HoldResponse =
  | { ok: true; holdId: string; asiento: number; ttlMs: number; expiresAt: string }
  | { ok: false; error: string; expiresAt?: string };

type PriceInfo = {
  quantity: number;
  basePrice: number;
  baseTotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  savings: string;
};

function buildGrid(seats: SeatItem[]) {
  const total = seats.length;
  const rows = Math.ceil(total / 4);
  const byNum = new Map(seats.map((s) => [s.numero, s]));

  const grid: Array<{ row: number; left: SeatItem[]; right: SeatItem[] }> = [];
  let n = 1;

  for (let r = 1; r <= rows; r++) {
    const left: SeatItem[] = [];
    const right: SeatItem[] = [];
    for (let c = 0; c < 4; c++) {
      const s = byNum.get(n);
      if (s) {
        if (c <= 1) left.push(s);
        else right.push(s);
      }
      n++;
    }
    grid.push({ row: r, left, right });
  }
  return grid;
}

function seatLabel(pos: "left" | "right", idx: number) {
  if (pos === "left") return idx === 0 ? "Ventana" : "Pasillo";
  return idx === 0 ? "Pasillo" : "Ventana";
}

// Precios
const PRICE_CONFIG = {
  BASE_PRICE: 50000,
  DISCOUNTS: {
    2: 0.05,
    3: 0.07,
    4: 0.10,
  },
};

function calculatePrice(quantity: number): PriceInfo {
  const baseTotal = PRICE_CONFIG.BASE_PRICE * quantity;
  let discount = 0;

  if (quantity >= 4) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[4];
  } else if (quantity >= 3) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[3];
  } else if (quantity >= 2) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[2];
  }

  const discountPercent = quantity >= 4 ? 10 : quantity >= 3 ? 7 : quantity >= 2 ? 5 : 0;
  const total = baseTotal - discount;

  return {
    quantity,
    basePrice: PRICE_CONFIG.BASE_PRICE,
    baseTotal,
    discountPercent,
    discountAmount: Math.round(discount),
    total: Math.round(total),
    savings: discount > 0 ? `Ahorras: $${Math.round(discount)}` : "",
  };
}

function SeatButton({
  seat,
  isSelected,
  onToggle,
  pos,
  idx,
}: {
  seat: SeatItem;
  isSelected: boolean;
  onToggle: () => void;
  pos: "left" | "right";
  idx: number;
}) {
  const disabled = seat.estado !== "available";
  const label = seatLabel(pos, idx);

  let colorClass = "";
  if (seat.estado === "reserved") {
    colorClass =
      "bg-red-700 border-red-500 text-white cursor-not-allowed opacity-80";
  } else if (seat.estado === "held") {
    colorClass =
      "bg-yellow-500 border-yellow-400 text-gray-900 cursor-not-allowed opacity-80";
  } else if (isSelected) {
    colorClass =
      "bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/40 scale-105";
  } else {
    colorClass =
      "bg-gray-700 border-gray-500 text-gray-100 hover:bg-indigo-700 hover:border-indigo-400 hover:scale-105 cursor-pointer";
  }

  return (
    <button
      disabled={disabled}
      onClick={onToggle}
      title={`Asiento ${seat.numero} - ${label}`}
      className={`
        flex flex-col items-center justify-center
        w-16 h-16 rounded-xl border-2
        text-xs font-semibold
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-indigo-400
        ${colorClass}
      `}
    >
      <span className="text-base font-bold leading-none">{seat.numero}</span>
      <span className="text-[10px] mt-1 opacity-80">{label}</span>
    </button>
  );
}

export default function SeatPicker() {
  const API = import.meta.env.VITE_SEAT_API_URL as string;

  const [rutaId, setRutaId] = useState("123");
  const [fecha, setFecha] = useState("2026-01-26");

  const [data, setData] = useState<DisponiblesResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const grid = useMemo(() => buildGrid(data?.asientos ?? []), [data]);
  const priceInfo = useMemo(() => calculatePrice(selected.size), [selected.size]);

  async function load() {
    setMsg("");
    setLoading(true);
    if (!API) {
      setMsg("⚠️ Falta VITE_SEAT_API_URL en tu frontend.");
      setLoading(false);
      return;
    }
    try {
      const url = `${API}/api/asientos/disponibles?rutaId=${rutaId}&fecha=${fecha}`;
      const r = await fetch(url);
      const j = (await r.json()) as DisponiblesResponse;

      if (!j.ok) {
        setMsg(`❌ ${j.error || "Error cargando asientos"}`);
        setLoading(false);
        return;
      }
      setData(j);

      const newSelected = new Set(selected);
      for (const num of newSelected) {
        const s = j.asientos.find((x) => x.numero === num);
        if (!s || s.estado !== "available") {
          newSelected.delete(num);
        }
      }
      setSelected(newSelected);
    } catch (error) {
      setMsg(`❌ Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    } finally {
      setLoading(false);
    }
  }

  async function hold() {
    if (selected.size === 0) return;
    setMsg("");
    setLoading(true);

    try {
      const holdIds: string[] = [];
      for (const asiento of Array.from(selected)) {
        const r = await fetch(`${API}/api/asientos/reservar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rutaId, fecha, asiento, userId: "user-app" }),
        });

        const j = (await r.json()) as HoldResponse;
        if (!j.ok) {
          setMsg(`❌ ${j.error}`);
          await load();
          setLoading(false);
          return;
        }
        if (j.ok) {
          holdIds.push(j.holdId);
        }
      }

      setMsg(
        `✅ ${selected.size} asiento(s) bloqueado(s). Total: $${priceInfo.total} ${priceInfo.savings}`
      );
      setSelected(new Set());
      await load();
    } catch (error) {
      setMsg(`❌ Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSeat(seatNumber: number) {
    const newSelected = new Set(selected);
    if (newSelected.has(seatNumber)) {
      newSelected.delete(seatNumber);
    } else {
      newSelected.add(seatNumber);
    }
    setSelected(newSelected);
  }

  const availableCount = data?.asientos.filter((s) => s.estado === "available").length ?? 0;
  const heldCount = data?.asientos.filter((s) => s.estado === "held").length ?? 0;
  const reservedCount = data?.asientos.filter((s) => s.estado === "reserved").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      {/* Header */}
      <h1 className="text-3xl font-bold text-center mb-6 text-indigo-300 tracking-tight">
        🚌 Selecciona tu Asiento
      </h1>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 justify-center mb-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            Ruta ID
          </label>
          <input
            type="text"
            value={rutaId}
            onChange={(e) => setRutaId(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
            Fecha
          </label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-gray-800 border border-gray-600 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-5 py-2 transition-colors duration-200 text-sm"
        >
          {loading ? "Cargando..." : "🔄 Actualizar"}
        </button>

        {/* Legend */}
        <div className="flex items-center gap-4 ml-2">
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-gray-700 border border-gray-500 inline-block" />
            <span className="text-xs text-gray-400">Disponible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-yellow-500 border border-yellow-400 inline-block" />
            <span className="text-xs text-gray-400">Bloqueado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-red-700 border border-red-500 inline-block" />
            <span className="text-xs text-gray-400">Reservado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-indigo-600 border border-indigo-400 inline-block" />
            <span className="text-xs text-gray-400">Seleccionado</span>
          </div>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div
          className={`max-w-xl mx-auto mb-6 px-4 py-3 rounded-xl text-sm font-medium border ${msg.startsWith("✅")
              ? "bg-green-900/50 border-green-600 text-green-300"
              : "bg-red-900/50 border-red-600 text-red-300"
            }`}
        >
          {msg}
        </div>
      )}

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6 justify-center items-start max-w-5xl mx-auto">

        {/* Bus Map */}
        <div className="flex-1 min-w-0">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-xl">
            {/* Bus header */}
            <div className="bg-indigo-900/60 border-b border-indigo-700 px-4 py-3 text-center">
              <span className="text-sm font-semibold text-indigo-200 tracking-wide">
                🪟 Ventana — Pasillo — Pasillo — Ventana 🪟
              </span>
            </div>

            {/* Seat grid */}
            <div className="p-4 space-y-3">
              {grid.length === 0 && !loading && (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No hay asientos cargados. Presiona Actualizar.
                </p>
              )}
              {loading && grid.length === 0 && (
                <p className="text-center text-gray-500 py-8 text-sm animate-pulse">
                  Cargando asientos...
                </p>
              )}
              {grid.map((row) => (
                <div key={row.row} className="flex items-center gap-3 justify-center">
                  {/* Row number */}
                  <span className="text-[11px] text-gray-600 w-5 text-right shrink-0">
                    {row.row}
                  </span>

                  {/* Left seats */}
                  <div className="flex gap-2">
                    {row.left.map((s, i) => (
                      <SeatButton
                        key={s.numero}
                        seat={s}
                        isSelected={selected.has(s.numero)}
                        onToggle={() => toggleSeat(s.numero)}
                        pos="left"
                        idx={i}
                      />
                    ))}
                  </div>

                  {/* Aisle */}
                  <div className="w-6 flex flex-col items-center gap-0.5 shrink-0">
                    <div className="w-0.5 h-3 bg-gray-600 rounded" />
                    <div className="w-0.5 h-3 bg-gray-600 rounded" />
                  </div>

                  {/* Right seats */}
                  <div className="flex gap-2">
                    {row.right.map((s, i) => (
                      <SeatButton
                        key={s.numero}
                        seat={s}
                        isSelected={selected.has(s.numero)}
                        onToggle={() => toggleSeat(s.numero)}
                        pos="right"
                        idx={i}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Stats bar */}
            <div className="bg-gray-800/50 border-t border-gray-700 px-4 py-2 flex justify-around text-xs text-gray-400">
              <span>✅ <strong className="text-green-400">{availableCount}</strong> disponibles</span>
              <span>🟡 <strong className="text-yellow-400">{heldCount}</strong> bloqueados</span>
              <span>🔴 <strong className="text-red-400">{reservedCount}</strong> reservados</span>
            </div>
          </div>
        </div>

        {/* Sidebar: Cart */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gray-800/60 border-b border-gray-700 px-4 py-3">
              <h3 className="text-base font-bold text-gray-100">📋 Tu Carrito</h3>
            </div>

            <div className="p-4 space-y-4">
              {selected.size === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  Selecciona asientos para continuar
                </p>
              ) : (
                <>
                  {/* Selected seat tags */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                      Asientos seleccionados
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selected)
                        .sort((a, b) => a - b)
                        .map((num) => (
                          <span
                            key={num}
                            className="flex items-center gap-1 bg-indigo-700/50 border border-indigo-500 text-indigo-200 text-xs px-2 py-1 rounded-lg"
                          >
                            #{num}
                            <button
                              className="text-indigo-300 hover:text-white ml-1 leading-none"
                              onClick={() => toggleSeat(num)}
                              title="Quitar asiento"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Price breakdown */}
                  <div className="bg-gray-800/50 rounded-xl p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Cantidad:</span>
                      <strong className="text-gray-200">{priceInfo.quantity} asiento(s)</strong>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Precio unitario:</span>
                      <strong className="text-gray-200">${priceInfo.basePrice.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Subtotal:</span>
                      <strong className="text-gray-200">${priceInfo.baseTotal.toLocaleString()}</strong>
                    </div>

                    {priceInfo.discountPercent > 0 && (
                      <>
                        <div className="flex justify-between text-green-400">
                          <span>Descuento ({priceInfo.discountPercent}%):</span>
                          <strong>-${priceInfo.discountAmount.toLocaleString()}</strong>
                        </div>
                        <div className="text-xs text-green-400 text-right">
                          💰 {priceInfo.savings}
                        </div>
                      </>
                    )}

                    <div className="border-t border-gray-600 pt-2 flex justify-between">
                      <span className="font-bold text-gray-100">TOTAL:</span>
                      <strong className="text-indigo-300 text-base">
                        ${priceInfo.total.toLocaleString()}
                      </strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={hold}
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-colors duration-200 text-sm"
                  >
                    {loading ? "Procesando..." : `🔒 Bloquear ${selected.size} Asiento(s)`}
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    disabled={loading}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-semibold rounded-xl px-4 py-2.5 transition-colors duration-200 text-sm"
                  >
                    Limpiar carrito
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
