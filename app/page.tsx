"use client";

import React, { useEffect, useMemo, useState } from "react";

/** EL IMPOSTOR — versión completa (oscura)
 * - Menú → Categorías / Custom / Gestionar categorías
 * - Gestionar categorías: crear, editar, borrar, agregar muchas palabras con UNA textarea, chips removibles, secciones plegables
 * - Custom: igual patrón (chips + “Guardar como categoría”)
 * - No repetir palabras hasta agotar (persistencia por categoría en localStorage)
 * - Fix SSR: todos los accesos a localStorage protegidos
 * - Fix build: toggle con !o (no XOR), sin “0” fantasma
 */

type Phase = "menu" | "categories" | "manage" | "custom" | "players" | "reveal" | "between";
type Category = { id: string; name: string; words: string[] };

const UI = {
  bg: "from-neutral-950 to-neutral-900",
  card: "bg-neutral-900/90 border border-neutral-800",
  text: "text-neutral-50",
  sub: "text-neutral-400",
  pill: "bg-neutral-800 border border-neutral-700",
  btnRed: "bg-red-600 hover:bg-red-700 text-white",
  btnLight: "bg-neutral-100 hover:bg-neutral-200 text-neutral-900",
  btnDark: "bg-neutral-800 hover:bg-neutral-700 text-neutral-50 border border-neutral-700",
  outline: "border-neutral-700",
};

// ====== PRESETS por defecto (50 palabras c/u) ======
const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "frutas",
    name: "Frutas",
    words: [
      "manzana","banana","naranja","pera","frutilla","uva","sandía","melón","kiwi","ciruela",
      "durazno","mango","papaya","ananá","cereza","arándano","frambuesa","mora","pomelo","limón",
      "mandarina","damasco","higo","granada","maracuyá","lichi","guayaba","tuna","coco","carambola",
      "caqui","membrillo","tamarindo","bergamota","kumquat","níspero","grosella","arándano rojo","arándano negro","grosella negra",
      "melocotón","plátano","kiwano","physalis","pitaya","naranja sanguina","pomelo rosado","mamey","moras blancas","yacaratiá"
    ],
  },
  {
    id: "cocina",
    name: "Cocina",
    words: [
      "sartén","cuchillo","olla","hervir","horno","sal","aceite","receta","tostadora","espátula",
      "cucharón","tabla","pelapapas","batidor","colador","microondas","licuadora","cucharita","tenedor","plato",
      "cacerola","soplete","cuchara","vaso","taza","jarra","cuchillo chef","mortero","rodillo","balanza",
      "rallador","mandolina","pinza","fuente","rejilla","batidora","freidora","plancha","molde","termómetro",
      "film","aluminio","servilleta","individual","posapavas","abrelatas","sifón","pimentero","salero","paño"
    ],
  },
  {
    id: "lugares",
    name: "Lugares",
    words: [
      "biblioteca","aeropuerto","playa","montaña","hospital","museo","estadio","hotel","teatro","oficina",
      "plaza","parque","restaurante","bar","carnicería","panadería","verdulería","ferretería","escuela","universidad",
      "gimnasio","piscina","estación","subte","colectora","autopista","terminal","zoológico","acuario","planetario",
      "banco","farmacia","comisaría","municipalidad","embajada","consulado","estudio","galería","aula","cancha",
      "patio","terraza","sótano","ático","cabaña","hostel","balneario","mirador","muelle","puente"
    ],
  },
];

// ====== Helpers (con guards para SSR) ======
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function uid() { return Math.random().toString(36).slice(2, 9); }
function hashWords(words: string[]) { return words.join("\n").toLowerCase(); }
function splitByLines(v: string) { return v.split(/\r?\n/).map(s => s.trim()).filter(Boolean); }

function getUsedKey(key: string) { return `impostor_used_${key}`; }
function loadUsedSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const j = window.localStorage.getItem(getUsedKey(key));
    return j ? new Set(JSON.parse(j) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveUsedSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(getUsedKey(key), JSON.stringify([...set])); } catch {}
}
function pickNextWord(words: string[], used: Set<string>): string | null {
  const available = words.filter(w => !used.has(w));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ====== UI atoms ======
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`max-w-xl w-full rounded-3xl shadow-2xl p-6 mx-auto ${UI.card} ${UI.text} ${className}`}>{children}</div>;
}
function Pill({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${UI.pill}`}>
      {children}
      {onRemove && <button onClick={onRemove} className="text-xs opacity-60 hover:opacity-100">✕</button>}
    </span>
  );
}
function Header() {
  return (
    <div className="text-center mb-6 select-none">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">El Impostor</h1>
      <p className={`text-sm mt-1 ${UI.sub}`}>by @joacogarciarivara</p>
    </div>
  );
}

// ====== Subcomponentes (gestión y custom) ======
function CreateCategorySection({ onCreate }: { onCreate: (name: string, words: string[]) => void }) {
  const [name, setName] = useState("");
  const [multi, setMulti] = useState("");
  return (
    <div className="rounded-xl border border-neutral-800 p-4 bg-neutral-900/60">
      <h3 className="font-semibold mb-2">Crear categoría</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej.: Frutas)" className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2" />
        <textarea value={multi} onChange={(e) => setMulti(e.target.value)} placeholder={"Pegá o escribí palabras, UNA por línea.\nEj: manzana\nbanana\nnaranja"} className="sm:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 min-h-[90px]"/>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            const ws = splitByLines(multi);
            if (!name.trim() || ws.length === 0) { alert("Completá el nombre y al menos una palabra"); return; }
            onCreate(name.trim(), ws);
            setName(""); setMulti("");
          }}
          className={`rounded-lg px-3 py-2 ${UI.btnRed}`}
        >Guardar categoría</button>
        <button onClick={() => { setName(""); setMulti(""); }} className={`rounded-lg px-3 py-2 ${UI.btnDark}`}>Limpiar</button>
      </div>
    </div>
  );
}

function CategoryEditorList({
  categories, onUpdate, onDelete,
}: {
  categories: Category[];
  onUpdate: (id: string, name: string, words: string[]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {categories.map((c) => (
        <CategoryRow key={c.id} category={c} onUpdate={(n, w) => onUpdate(c.id, n, w)} onDelete={() => onDelete(c.id)} />
      ))}
      {categories.length === 0 && <p className="text-sm text-neutral-500">No hay categorías aún. ¡Creá la primera!</p>}
    </div>
  );
}

function CategoryRow({
  category, onUpdate, onDelete,
}: {
  category: Category;
  onUpdate: (name: string, words: string[]) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category.name);
  const [stash, setStash] = useState("");
  const [words, setWords] = useState<string[]>(category.words);

  // incluir name/words para evitar warnings de ESLint (no rompen build, pero lo dejamos prolijo)
  useEffect(() => { setName(category.name); setWords(category.words); }, [category.id, category.name, category.words]);

  function addStash() {
    const lines = splitByLines(stash);
    if (!lines.length) { alert("Escribí o pegá palabras (una por línea)"); return; }
    setWords(w => [...w, ...lines]);
    setStash("");
  }
  function removeAt(i: number) { setWords(arr => arr.filter((_, j) => j !== i)); }

  return (
    <div className="rounded-xl border border-neutral-800">
      <button
        onClick={() => setOpen(o => !o)}   // <-- FIX: antes era XOR (o ^ true)
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="text-left">
          <div className="font-medium">{name}</div>
          <div className="text-xs text-neutral-500">{words.length} palabras</div>
        </div>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-4 border-t border-neutral-800 space-y-3 bg-neutral-900/60">
          <div className="flex items-center justify-between gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 flex-1" />
            <div className="flex gap-2">
              <button onClick={() => onUpdate(name.trim() || category.name, words)} className={`rounded-lg px-3 py-2 ${UI.btnDark}`}>Guardar</button>
              <button onClick={onDelete} className={`rounded-lg px-3 py-2 ${UI.btnDark}`}>Borrar</button>
            </div>
          </div>

          <div className="flex gap-2">
            <textarea value={stash} onChange={(e) => setStash(e.target.value)} placeholder="Pegá o escribí palabras, UNA por línea" className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 min-h-[90px]" />
            <button onClick={addStash} className={`rounded-lg px-3 py-2 ${UI.btnRed}`}>Agregar</button>
          </div>

          {words.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {words.map((w, i) => <Pill key={`${w}-${i}`} onRemove={() => removeAt(i)}>{w}</Pill>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomWords({
  initialWords, onBack, onSaveAndContinue, onSaveCategory,
}: {
  initialWords: string[];
  onBack: () => void;
  onSaveAndContinue: (words: string[]) => void;
  onSaveCategory: (name: string, words: string[]) => void;
}) {
  const [list, setList] = useState<string[]>(initialWords);
  const [buffer, setBuffer] = useState("");

  function addFromBuffer() {
    const lines = splitByLines(buffer);
    if (!lines.length) { alert("Escribí o pegá palabras (una por línea)"); return; }
    setList(prev => [...prev, ...lines]); setBuffer("");
  }
  function removeAt(i: number) { setList(prev => prev.filter((_, j) => j !== i)); }

  return (
    <Card>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Tus palabras (Custom)</h2>

        <textarea rows={6} value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder={"Pegá o escribí palabras, UNA por línea.\nEj: guitarra\nautopista\nsemáforo"} className={`w-full bg-neutral-900 border ${UI.outline} rounded-xl px-3 py-2 font-mono text-sm ${UI.text}`} />
        <p className={`text-xs ${UI.sub}`}>Podés pegar un párrafo con varias líneas y se agregan todas juntas.</p>

        <div className="flex gap-2">
          <button onClick={addFromBuffer} className={`rounded-xl px-4 py-2 ${UI.btnRed}`}>Agregar</button>
          <button onClick={() => setBuffer("")} className={`rounded-xl px-4 py-2 ${UI.btnDark}`}>Limpiar</button>
        </div>

        {list.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.map((w, i) => <Pill key={`${w}-${i}`} onRemove={() => removeAt(i)}>{w}</Pill>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={onBack} className={`rounded-xl py-3 ${UI.btnDark}`}>Volver</button>
          <button onClick={() => { if (!list.length) { alert("Cargá al menos una palabra"); return; } onSaveAndContinue(list); }} className={`rounded-xl py-3 ${UI.btnLight}`}>Continuar</button>
        </div>

        <button onClick={() => { if (!list.length) { alert("No hay palabras para guardar"); return; } const name = prompt("Nombre de la nueva categoría:", "Custom"); if (!name) return; onSaveCategory(name, list); alert("Guardado en categorías"); }} className={`w-full rounded-xl py-2 text-sm ${UI.btnDark}`}>Guardar como categoría</button>
      </div>
    </Card>
  );
}

// ====== App principal ======
export default function Page() {
  const [phase, setPhase] = useState<Phase>("menu");

  // Categorías (persisten). Cargamos en useEffect para evitar SSR.
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("impostor_categories_v3");
    if (saved) {
      try { setCategories(JSON.parse(saved)); }
      catch { setCategories(DEFAULT_CATEGORIES); }
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("impostor_categories_v3", JSON.stringify(categories));
  }, [categories]);

  // Selección (categoría o custom)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Custom como lista (persistente)
  const [customList, setCustomList] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("impostor_custom_words_list_v3");
      setCustomList(saved ? (JSON.parse(saved) as string[]) : []);
    } catch { setCustomList([]); }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("impostor_custom_words_list_v3", JSON.stringify(customList));
  }, [customList]);

  const selectedCategory = useMemo(() => categories.find(c => c.id === selectedCategoryId) || null, [categories, selectedCategoryId]);
  const words = useMemo<string[]>(() => (selectedCategory ? selectedCategory.words : customList), [selectedCategory, customList]);

  // Clave para “no repetir”
  const wordsKey = useMemo(
    () => (selectedCategory ? `category_${selectedCategory.id}` : `custom_${hashWords(words)}`),
    [selectedCategory, words]
  );

  // Config de partida
  const [players, setPlayers] = useState(6);
  const [impostors, setImpostors] = useState(1);
  const maxImpostors = useMemo(() => clamp(Math.floor(players / 2), 1, 10), [players]);
  useEffect(() => { setImpostors(prev => clamp(prev, 1, maxImpostors)); }, [players, maxImpostors]);

  // Ronda
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [secretWord, setSecretWord] = useState<string | null>(null);
  const [isImpostor, setIsImpostor] = useState<boolean[]>([]);

  // Gestión categorías
  function addCategory(name: string, w: string[]) {
    const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + uid();
    setCategories(prev => [...prev, { id, name, words: w }]);
  }
  function updateCategory(id: string, name: string, w: string[]) {
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, name, words: w } : c)));
  }
  function deleteCategory(id: string) {
    if (!confirm("¿Borrar esta categoría?")) return;
    setCategories(prev => prev.filter(c => c.id !== id));
    if (selectedCategoryId === id) setSelectedCategoryId(null);
  }

  // Juego
  function ensureNewWordOrAlert(): boolean {
    const used = loadUsedSet(wordsKey);
    const next = pickNextWord(words, used);
    if (!next) {
      const reset = confirm("Se agotaron las palabras. ¿Reiniciar el ciclo?");
      if (reset) { saveUsedSet(wordsKey, new Set()); return ensureNewWordOrAlert(); }
      return false;
    }
    setSecretWord(next); used.add(next); saveUsedSet(wordsKey, used); return true;
  }
  function preparePlayersAndRoles() {
  // Sesgo leve: jugador 1 con 0.75 del peso del resto
  const weights: number[] = Array.from({ length: players }, (_, i) => (i === 0 ? 0.75 : 1));
  const chosen: number[] = [];
  const w: number[] = weights.slice(); // <- number[] (tipo ensanchado)

  for (let k = 0; k < impostors; k++) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) break;

    let r = Math.random() * total;
    let pick = -1;

    for (let i = 0; i < w.length; i++) {
      r -= w[i];
      if (r <= 0) { pick = i; break; }
    }
    if (pick === -1) {
      pick = w.findIndex(val => val > 0);
      if (pick === -1) break;
    }

    chosen.push(pick);
    w[pick] = 0; // ahora no rompe: w es number[]
  }

  const flags = Array.from({ length: players }, (_, i) => chosen.includes(i));
  setIsImpostor(flags);
  setCurrentIndex(0);
  setRevealed(false);
}
  function startGame() {
    if (players < 3) { alert("Mínimo 3 jugadores"); return; }
    if (impostors >= players) { alert("Impostores no pueden ser >= jugadores"); return; }
    if (!words.length) { alert("Cargá palabras o elegí una categoría"); return; }
    if (!ensureNewWordOrAlert()) return; preparePlayersAndRoles(); setPhase("reveal");
  }
  function nextPlayer() { if (currentIndex + 1 >= players) { setPhase("between"); setRevealed(false); } else { setCurrentIndex(i => i + 1); setRevealed(false); } }
  function nextRound() { if (!ensureNewWordOrAlert()) return; preparePlayersAndRoles(); setPhase("reveal"); }
  function resetAll() {
    setPhase("menu"); setSelectedCategoryId(null); setCustomList([]);
    setPlayers(6); setImpostors(1); setCurrentIndex(0); setRevealed(false); setSecretWord(null); setIsImpostor([]);
  }

  // Render
  return (
    <main className={`min-h-screen w/full flex items-center justify-center p-4 bg-gradient-to-br ${UI.bg}`}>
      <div className="w-full max-w-xl">
        <Header />

        {/* MENÚ */}
        {phase === "menu" && (
          <Card>
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-center">Menú principal</h2>
              <div className="grid grid-cols-1 gap-3 mt-2">
                <button onClick={() => setPhase("categories")} className={`rounded-2xl py-3 ${UI.btnRed} shadow`}>Categorías</button>
                <button onClick={() => setPhase("custom")} className={`rounded-2xl py-3 ${UI.btnLight} shadow`}>Custom</button>
              </div>
              <p className={`text-center text-xs ${UI.sub}`}>Tip: subí el brillo y no la regales a la primera campeón!</p>
            </div>
          </Card>
        )}

        {/* CATEGORÍAS */}
        {phase === "categories" && (
          <Card>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Elegí una categoría</h2>
              <div className="grid grid-cols-1 gap-2">
                {categories.map((c) => (
                  <button key={c.id} onClick={() => { setSelectedCategoryId(c.id); setPhase("players"); }} className={`rounded-xl py-3 ${UI.btnDark} text-left px-4 hover:shadow`}>
                    <div className="font-medium">{c.name}</div>
                    <div className={`text-xs ${UI.sub}`}>{c.words.length} palabras</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button onClick={() => setPhase("menu")} className={`rounded-xl py-3 ${UI.btnDark}`}>Volver</button>
                <button onClick={() => setPhase("manage")} className={`rounded-xl py-3 ${UI.btnRed}`}>Gestionar categorías</button>
              </div>
            </div>
          </Card>
        )}

        {/* GESTIONAR CATEGORÍAS */}
        {phase === "manage" && (
          <Card>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Gestionar categorías</h2>
              <CreateCategorySection onCreate={(n, w) => addCategory(n, w)} />
              <CategoryEditorList
                categories={categories}
                onUpdate={(id, n, w) => updateCategory(id, n, w)}
                onDelete={(id) => deleteCategory(id)}
              />
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button onClick={() => setPhase("categories")} className={`rounded-xl py-3 ${UI.btnDark}`}>Volver</button>
                <span />
              </div>
            </div>
          </Card>
        )}

        {/* CUSTOM */}
        {phase === "custom" && (
          <CustomWords
            initialWords={customList}
            onBack={() => setPhase("menu")}
            onSaveAndContinue={(list) => { setCustomList(list); setSelectedCategoryId(null); setPhase("players"); }}
            onSaveCategory={(name, list) => addCategory(name, list)}
          />
        )}

        {/* CONFIGURAR PARTIDA */}
        {phase === "players" && (
          <Card>
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Configurá la partida</h2>
              <div className="rounded-xl border p-3 text-sm flex items-center justify-between bg-neutral-900/60 border-neutral-800">
                <div>
                  <div className={`${UI.sub}`}>Palabras</div>
                  <div className="font-medium">{selectedCategory ? selectedCategory.name : `Custom (${words.length})`}</div>
                </div>
                <button onClick={() => setPhase(selectedCategory ? "categories" : "custom")} className={`rounded-lg px-3 py-2 ${UI.btnDark}`}>Cambiar</button>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cantidad de jugadores</label>
                <input type="number" min={3} max={20} value={players} onChange={(e) => setPlayers(clamp(parseInt(e.target.value || "0"), 1, 20))} className={`w-full bg-neutral-900 border ${UI.outline} rounded-xl px-3 py-2 ${UI.text}`} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Cantidad de impostores</label>
                <input type="number" min={1} max={maxImpostors} value={impostors} onChange={(e) => setImpostors(clamp(parseInt(e.target.value || "0"), 1, maxImpostors))} className={`w-full bg-neutral-900 border ${UI.outline} rounded-xl px-3 py-2 ${UI.text}`} />
                <p className={`text-xs ${UI.sub} mt-1`}>Máximo sugerido: {maxImpostors}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setPhase("menu")} className={`rounded-xl py-3 ${UI.btnDark}`}>Volver</button>
                <button onClick={startGame} className={`rounded-xl py-3 ${UI.btnRed}`}>Iniciar</button>
              </div>
            </div>
          </Card>
        )}

        {/* REVELAR */}
        {phase === "reveal" && (
          <Card>
            <div className="space-y-4">
              <p className="text-center text-base font-semibold">Jugador <span className="text-2xl font-extrabold">{currentIndex + 1}</span> de {players}</p>
              <button onClick={() => setRevealed(r => !r)} className={`w-full h-48 rounded-2xl border-2 border-dashed flex items-center justify-center text-lg font-semibold bg-neutral-900/50 ${revealed ? 'border-red-600' : 'border-neutral-700'} hover:shadow-inner`}>
                {revealed ? (isImpostor[currentIndex] ? (
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-red-500">Sos el IMPOSTOR 🤫</div>
                    <div className={`${UI.sub} mt-1`}>No conocés las palabras</div>
                    <div className="text-sm mt-2 opacity-80">Tocá de nuevo para ocultar</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className={`${UI.sub}`}>La palabra es</div>
                    <div className="text-3xl font-extrabold mt-1">{secretWord}</div>
                    <div className="text-sm mt-2 opacity-80">Tocá de nuevo para ocultar</div>
                  </div>
                )) : (<span>Revelar</span>)}
              </button>
              <div className="grid grid-cols-1 gap-3">
                <button onClick={nextPlayer} className={`rounded-2xl py-3 ${UI.btnRed} active:scale-[0.99]`}>Siguiente jugador</button>
                <button onClick={() => setPhase("menu")} className={`w-full rounded-2xl py-2 text-sm underline ${UI.sub}`}>Volver al menú</button>
              </div>
            </div>
          </Card>
        )}

        {/* ENTRE RONDAS */}
        {phase === "between" && (
          <Card>
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-center">Ronda en curso</h2>
              <p className={`text-center ${UI.sub} text-sm`}>Debatan quién creen que es el impostor antes de continuar.</p>
              <div className="grid grid-cols-1 gap-3">
                <button onClick={nextRound} className={`rounded-2xl py-3 ${UI.btnLight} active:scale-[0.99]`}>Siguiente ronda</button>
                <button onClick={resetAll} className={`rounded-2xl py-3 ${UI.btnDark} active:scale-[0.99]`}>Volver al menú</button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
