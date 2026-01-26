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

export default function SeatPicker() {
  const API = import.meta.env.VITE_SEAT_API_URL as string;

  const [rutaId, setRutaId] = useState("123");
  const [fecha, setFecha] = useState("2026-01-26");

  const [data, setData] = useState<DisponiblesResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const grid = useMemo(() => buildGrid(data?.asientos ?? []), [data]);

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

      if (selected != null) {
        const s = j.asientos.find((x) => x.numero === selected);
        if (!s || s.estado !== "available") setSelected(null);
      }
    } catch (error) {
      setMsg(`❌ Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    } finally {
      setLoading(false);
    }
  }

  async function hold() {
    if (selected == null) return;
    setMsg("");
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/asientos/reservar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rutaId, fecha, asiento: selected, userId: "user-app" }),
      });

      const j = (await r.json()) as HoldResponse;

      if (j.ok) {
        setMsg(`✅ Asiento ${j.asiento} bloqueado hasta ${new Date(j.expiresAt).toLocaleTimeString()}`);
        setSelected(null);
        await load();
      } else {
        setMsg(`❌ ${j.error}`);
        await load();
      }
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
                  const isSelected = selected === s.numero;
                  return (
                    <button
                      key={s.numero}
                      disabled={disabled}
                      className={seatClass(s, isSelected)}
                      onClick={() => setSelected(s.numero)}
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
                  const isSelected = selected === s.numero;
                  return (
                    <button
                      key={s.numero}
                      disabled={disabled}
                      className={seatClass(s, isSelected)}
                      onClick={() => setSelected(s.numero)}
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
            <h3>📋 Tu Selección</h3>
            {selected == null ? (
              <p className="empty">Haz clic en un asiento disponible</p>
            ) : (
              <>
                <div className="selected-info">
                  <div className="info-label">Asiento seleccionado:</div>
                  <div className="info-value">{selected}</div>
                </div>
                <button className="btn btn-primary" onClick={hold} disabled={loading}>
                  {loading ? "Procesando..." : "Bloquear Asiento"}
                </button>
                <button className="btn btn-secondary" onClick={() => setSelected(null)} disabled={loading}>
                  Cancelar
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
