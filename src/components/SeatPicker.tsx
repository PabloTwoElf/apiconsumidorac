import { useEffect, useMemo, useState } from "react";
import "./SeatPicker.css";

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

      // Remover asientos ya no disponibles
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
      // Crear hold para cada asiento
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

  function seatClass(s: SeatItem, isSelected: boolean) {
    if (s.estado === "reserved") return "seat seat-reserved";
    if (s.estado === "held") return "seat seat-held";
    return `seat seat-available${isSelected ? " seat-selected" : ""}`;
  }

  return (
    <div className="wrap">
      <h1>🚌 Selecciona tu Asiento</h1>

      <div className="controls">
        <div className="field">
          <label>Ruta ID</label>
          <input type="text" value={rutaId} onChange={(e) => setRutaId(e.target.value)} />
        </div>

        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>

        <div className="legend">
          <span className="dot dot-available"></span> Disponible
          <span className="dot dot-held"></span> Bloqueado
          <span className="dot dot-reserved"></span> Reservado
        </div>
      </div>

      {msg && <div className={`msg ${msg.startsWith("✅") ? "msg-success" : "msg-error"}`}>{msg}</div>}

      <div className="layout">
        <div className="bus">
          <div className="bus-header">Mapa de Asientos (Ventana - Pasillo - Ventana)</div>
          {grid.map((row) => (
            <div className="row" key={row.row}>
              <div className="side">
                {row.left.map((s, i) => {
                  const disabled = s.estado !== "available";
                  const isSelected = selected.has(s.numero);
                  return (
                    <button
                      key={s.numero}
                      disabled={disabled}
                      className={seatClass(s, isSelected)}
                      onClick={() => toggleSeat(s.numero)}
                      title={`Asiento ${s.numero} - ${seatLabel("left", i)}`}
                    >
                      <div className="seat-num">{s.numero}</div>
                      <div className="seat-pos">{seatLabel("left", i)}</div>
                    </button>
                  );
                })}
              </div>

              <div className="aisle">||</div>

              <div className="side">
                {row.right.map((s, i) => {
                  const disabled = s.estado !== "available";
                  const isSelected = selected.has(s.numero);
                  return (
                    <button
                      key={s.numero}
                      disabled={disabled}
                      className={seatClass(s, isSelected)}
                      onClick={() => toggleSeat(s.numero)}
                      title={`Asiento ${s.numero} - ${seatLabel("right", i)}`}
                    >
                      <div className="seat-num">{s.numero}</div>
                      <div className="seat-pos">{seatLabel("right", i)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar">
          <div className="sidebar-content">
            <h3>📋 Tu Carrito</h3>
            {selected.size === 0 ? (
              <p className="empty">Selecciona asientos para continuar</p>
            ) : (
              <>
                <div className="cart-items">
                  <div className="cart-header">Asientos seleccionados:</div>
                  <div className="seats-list">
                    {Array.from(selected)
                      .sort((a, b) => a - b)
                      .map((num) => (
                        <span key={num} className="seat-tag">
                          {num}{" "}
                          <button
                            className="remove-btn"
                            onClick={() => toggleSeat(num)}
                            title="Quitar asiento"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>
                </div>

                <div className="price-breakdown">
                  <div className="price-row">
                    <span>Cantidad:</span>
                    <strong>{priceInfo.quantity} asiento(s)</strong>
                  </div>
                  <div className="price-row">
                    <span>Precio unitario:</span>
                    <strong>${priceInfo.basePrice}</strong>
                  </div>
                  <div className="price-row">
                    <span>Subtotal:</span>
                    <strong>${priceInfo.baseTotal}</strong>
                  </div>

                  {priceInfo.discountPercent > 0 && (
                    <>
                      <div className="price-row discount">
                        <span>Descuento ({priceInfo.discountPercent}%):</span>
                        <strong>-${priceInfo.discountAmount}</strong>
                      </div>
                      <div className="price-row savings">
                        <span>💰 {priceInfo.savings}</span>
                      </div>
                    </>
                  )}

                  <div className="price-row total">
                    <span>TOTAL:</span>
                    <strong>${priceInfo.total}</strong>
                  </div>
                </div>

                <button className="btn btn-primary" onClick={hold} disabled={loading}>
                  {loading ? "Procesando..." : `Bloquear ${selected.size} Asiento(s)`}
                </button>
                <button className="btn btn-secondary" onClick={() => setSelected(new Set())} disabled={loading}>
                  Limpiar carrito
                </button>
              </>
            )}
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Disponibles:</span>
                <span className="stat-value">{data?.asientos.filter(s => s.estado === "available").length || 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Bloqueados:</span>
                <span className="stat-value">{data?.asientos.filter(s => s.estado === "held").length || 0}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Reservados:</span>
                <span className="stat-value">{data?.asientos.filter(s => s.estado === "reserved").length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
