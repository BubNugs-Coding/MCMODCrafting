// Minimal Minecraft Recipe Explorer (vanilla JS)

const state = {
  // Map output item id -> array of recipes
  byOutput: new Map(),
  // Set of all item ids seen in outputs (for search suggestions)
  allOutputs: new Set(),
  // All parsed recipes (for debugging)
  allRecipes: [],
  // Display preference: 'name' | 'id'
  displayMode: 'name',
};

const els = {
  folderInput: document.getElementById('folderInput'),
  filesInput: document.getElementById('filesInput'),
  dropZone: document.getElementById('dropZone'),
  loadStatus: document.getElementById('loadStatus'),
  searchInput: document.getElementById('searchInput'),
  itemList: document.getElementById('itemList'),
  showBtn: document.getElementById('showBtn'),
  results: document.getElementById('results'),
  depthInput: document.getElementById('depthInput'),
  depthValue: document.getElementById('depthValue'),
  searchNote: document.getElementById('searchNote'),
  displayToggle: document.getElementById('displayToggle'),
};

// Utilities
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const isJsonFile = (f) => f && f.name && f.name.toLowerCase().endsWith('.json');
const fmtId = (id) => id || 'unknown:item'; // Fallback id label

function titleCaseWord(w) {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

const adjectiveSet = new Set([
  'wood', 'wooden', 'stone', 'iron', 'gold', 'golden', 'diamond', 'netherite', 'copper', 'emerald',
  'oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped',
  'red', 'green', 'blue', 'yellow', 'black', 'white', 'brown', 'purple', 'pink', 'cyan', 'gray', 'light_gray', 'light_blue', 'lime', 'magenta', 'orange',
]);

// Convert an item id (namespace:path) to a friendly display name
function humanizeItemId(id) {
  if (!id) return 'Unknown';
  // Strip namespace
  const body = id.includes(':') ? id.split(':', 2)[1] : id;
  // If path segments exist, keep last segment (common for blocks like minecraft:stone/variant)
  const base = body.split('/').pop();
  const tokens = base.split('_');
  // Handle two-word adjective at end (e.g., light_gray_wool -> Light Gray Wool)
  let moved = [];
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const last2 = tokens.slice(-2).join('_');
    if (adjectiveSet.has(last2)) {
      moved = tokens.splice(tokens.length - 2, 2);
      tokens.unshift(...moved);
    } else if (adjectiveSet.has(last)) {
      moved = tokens.splice(tokens.length - 1, 1);
      tokens.unshift(...moved);
    }
  }
  // Title case tokens and join
  return tokens.map((t) => t.split('-').map(titleCaseWord).join('-')).join(' ');
}

// Convert a tag id to a friendly label (e.g., #Forge/Ingots/Copper)
function humanizeTag(tag) {
  // e.g., forge:ingots/copper -> Ingots/Copper (tag)
  const body = tag.includes(':') ? tag.split(':', 2)[1] : tag;
  const parts = body.split('/').map((p) => p.split('_').map(titleCaseWord).join(' '));
  return `#${parts.join('/')}`;
}

function fmtItemLabel(idOrTag) {
  if (!idOrTag) return 'Unknown';
  if (idOrTag.startsWith('#')) {
    if (state.displayMode === 'name') {
      const rep = representativeForTag(idOrTag.slice(1));
      if (rep) return humanizeItemId(rep);
      return humanizeTag(idOrTag.slice(1));
    }
    return idOrTag;
  }
  return state.displayMode === 'name' ? humanizeItemId(idOrTag) : fmtId(idOrTag);
}

// Map some common tags to representative items for nicer labels
// Map common tags to a representative item id for display purposes
function representativeForTag(tag) {
  // tag: e.g., 'forge:plates/gold'
  const body = tag.includes(':') ? tag.split(':', 2)[1] : tag;
  const [group, metal] = body.split('/');
  if (group === 'plates' && metal) {
    const mapMetal = metal === 'gold' ? 'golden' : metal; // Create uses 'golden_sheet'
    return `create:${mapMetal}_sheet`;
  }
  if (group === 'ingots' && metal) return `minecraft:${metal}_ingot`;
  if (group === 'nuggets' && metal) return `minecraft:${metal}_nugget`;
  return null;
}

function clearResults() {
  els.results.innerHTML = '';
}

function setStatus(msg, isError = false) {
  els.loadStatus.textContent = msg || '';
  els.loadStatus.classList.toggle('error', !!isError);
}

function addOutputOption(id) {
  if (state.allOutputs.has(id)) return;
  state.allOutputs.add(id);
  const opt = document.createElement('option');
  opt.value = id;
  els.itemList.appendChild(opt);
}

function ingestRecipe(rec, sourcePath) {
  if (!rec) return;
  const outs = normalizeOutputs(rec);
  if (!outs.length) return;

  outs.forEach((out) => {
    const norm = normalizeRecipe(rec);
    norm.__source = sourcePath || '';
    norm.__out = out;
    // Preserve full results list for display if available
    if (Array.isArray(rec.results)) {
      norm.__allOuts = rec.results.map((r) => ({ item: r.item || r.id, count: r.count || 1, chance: r.chance }));
    }
    state.allRecipes.push(norm);
    const key = out.item;
    if (!state.byOutput.has(key)) state.byOutput.set(key, []);
    state.byOutput.get(key).push(norm);
    addOutputOption(key);
  });
}

// Normalization
function normalizeOutput(res) {
  if (!res) return null;
  if (typeof res === 'string') return { item: res, count: 1 };
  if (Array.isArray(res)) {
    const first = res.find((e) => e && (e.item || e.id));
    if (!first) return null;
    return { item: first.item || first.id, count: first.count || 1 };
  }
  if (res.item) return { item: res.item, count: res.count || 1 };
  if (res.id) return { item: res.id, count: res.count || 1 };
  if (res.result) return normalizeOutput(res.result);
  return null;
}

function normalizeOutputs(rec) {
  // Return list of outputs for indexing
  const outs = [];
  if (Array.isArray(rec.results)) {
    rec.results.forEach((r) => {
      const o = normalizeOutput(r);
      if (o && o.item) outs.push({ ...o, chance: r.chance });
    });
  }
  const single = normalizeOutput(rec.result || rec.output);
  if (single && single.item) outs.push(single);
  // Some processing recipes have top-level count
  outs.forEach((o) => {
    if ((o.count == null) && typeof rec.count === 'number') o.count = rec.count;
  });
  // De-dup
  const seen = new Set();
  return outs.filter((o) => {
    const k = `${o.item}|${o.count}|${o.chance ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeIngredient(ing) {
  // Returns array of options: [{item? , tag?}]
  if (!ing) return [];
  if (Array.isArray(ing)) return ing.flatMap(normalizeIngredient);
  if (typeof ing === 'string') return [{ item: ing }];
  if (ing.item) return [{ item: ing.item }];
  if (ing.tag) return [{ tag: ing.tag }];
  if (ing.fluid || ing.fluidTag) return [{ item: `fluid:${ing.fluid || ing.fluidTag}` }];
  if (ing.ingredient) return normalizeIngredient(ing.ingredient);
  if (ing.ingredients) return normalizeIngredient(ing.ingredients);
  return [];
}

function normalizeRecipe(rec) {
  const type = String(rec.type || '').toLowerCase();
  const base = { type };
  if (type.endsWith('crafting_shaped')) {
    const pattern = Array.isArray(rec.pattern) ? rec.pattern : [];
    const key = rec.key || {};
    const rows = Math.min(3, pattern.length);
    const cols = Math.min(3, pattern.reduce((m, r) => Math.max(m, r.length), 0));
    const grid = Array.from({ length: 9 }, () => []);
    for (let r = 0; r < rows; r++) {
      const row = pattern[r] || '';
      for (let c = 0; c < Math.min(cols, row.length); c++) {
        const ch = row[c];
        const mapped = key[ch];
        const idx = r * 3 + c;
        if (mapped) {
          grid[idx] = normalizeIngredient(mapped);
        } else if (ch === ' ' || ch === '.' || ch === undefined) {
          grid[idx] = [];
        } else {
          // Unknown mapping, treat as empty
          grid[idx] = [];
        }
      }
    }
    return { ...base, kind: 'shaped', grid, dims: { rows: Math.max(1, rows), cols: Math.max(1, cols) } };
  }

  if (type.endsWith('crafting_shapeless')) {
    const ings = Array.isArray(rec.ingredients) ? rec.ingredients : [];
    const flat = ings.map(normalizeIngredient);
    // Place into 3x3 row-major grid
    const grid = Array.from({ length: 9 }, () => []);
    flat.flat().forEach((opt, i) => {
      if (i < 9) grid[i] = [opt];
    });
    return { ...base, kind: 'shapeless', grid, dims: { rows: 3, cols: 3 } };
  }

  // Create mechanical crafting (variable grid)
  if (type.includes('mechanical_crafting')) {
    const pattern = Array.isArray(rec.pattern) ? rec.pattern : [];
    const key = rec.key || {};
    const rows = Math.max(1, pattern.length);
    const cols = Math.max(1, pattern.reduce((m, r) => Math.max(m, r.length), 0));
    const grid = Array.from({ length: rows * cols }, () => []);
    for (let r = 0; r < rows; r++) {
      const row = pattern[r] || '';
      for (let c = 0; c < cols; c++) {
        const ch = row[c];
        const idx = r * cols + c;
        const mapped = key[ch];
        grid[idx] = mapped ? normalizeIngredient(mapped) : [];
      }
    }
    return { ...base, kind: 'shaped', grid, dims: { rows, cols } };
  }

  // Create simple processes
  if (/create:(crushing|milling|pressing|cutting|mixing|deploying|filling|haunting|splashing|polishing)/.test(type)) {
    const extra = rec.ingredients || rec.ingredient || rec.input;
    const inputs = normalizeIngredient(extra);
    const resultsList = Array.isArray(rec.results)
      ? rec.results.map((r) => ({ item: r.item || r.id, count: r.count || 1, chance: r.chance }))
      : [normalizeOutput(rec.result)].filter(Boolean);
    return { ...base, kind: 'simple', action: type.split(':')[1], inputs, resultsList };
  }

  // Farmer's Delight cooking/cutting
  if (type.includes('farmersdelight:cooking')) {
    const inputs = normalizeIngredient(rec.ingredients || []);
    return { ...base, kind: 'simple', action: 'cooking', inputs, resultsList: [normalizeOutput(rec.result)].filter(Boolean) };
  }
  if (type.includes('farmersdelight:cutting')) {
    const inputs = normalizeIngredient(rec.ingredients || rec.ingredient);
    const resultsList = Array.isArray(rec.result) ? rec.result.map(normalizeOutput) : [normalizeOutput(rec.result)].filter(Boolean);
    return { ...base, kind: 'simple', action: 'cutting', inputs, resultsList };
  }

  // Smithing transform/trim
  if (type.endsWith('smithing_transform') || type.endsWith('smithing_trim')) {
    const baseIn = normalizeIngredient(rec.base);
    const tmpl = normalizeIngredient(rec.template);
    const add = normalizeIngredient(rec.addition);
    return { ...base, kind: 'smithing', baseIn, tmpl, add };
  }

  // TacZ Gun Smith Table (custom): { materials: [{ item: {item|tag}, count }], result: { id, count } }
  if (type.includes('gun_smith_table_crafting')) {
    const mats = Array.isArray(rec.materials) ? rec.materials : [];
    const materials = mats.map((m) => ({
      options: normalizeIngredient(m.item || m.ingredient || m),
      count: typeof m.count === 'number' ? m.count : 1,
    }));
    return { ...base, kind: 'gunsmith', materials };
  }

  // Create sequenced assembly
  if (type.includes('sequenced_assembly')) {
    const baseInput = normalizeIngredient(rec.ingredient || rec.input);
    const transitional = (rec.transitionalItem && (rec.transitionalItem.item || rec.transitionalItem.id)) || rec.transitionalItem || (baseInput[0] && baseInput[0].item) || 'create:incomplete';
    const loops = typeof rec.loops === 'number' ? rec.loops : 1;
    const seq = Array.isArray(rec.sequence) ? rec.sequence : [];
    const steps = seq.map((s) => {
      const st = String(s.type || '').split(':').pop();
      // Additional ingredient for deploying/filling etc.
      let extra = [];
      let extraFluids = [];
      if (Array.isArray(s.ingredients)) {
        // Typically [transitional, extra]
        const maybe = s.ingredients[1] || s.ingredients[0];
        extra = normalizeIngredient(maybe);
        if (maybe && typeof maybe === 'object' && maybe.fluid) {
          extraFluids.push({ id: maybe.fluid, amount: maybe.amount || 0 });
        }
      } else if (s.ingredient || s.input) {
        extra = normalizeIngredient(s.ingredient || s.input);
        const maybe = s.ingredient || s.input;
        if (maybe && typeof maybe === 'object' && maybe.fluid) {
          extraFluids.push({ id: maybe.fluid, amount: maybe.amount || 0 });
        }
      }
      return { action: st, extra, extraFluids };
    });
    const resultsList = Array.isArray(rec.results)
      ? rec.results.map((r) => ({ item: r.item || r.id, count: r.count || 1, chance: r.chance }))
      : [];
    return { ...base, kind: 'sequenced', baseInput, transitional, loops, steps, resultsList };
  }

  // Processing-like recipes (vanilla and generic: has ingredient(s) -> result(s))
  if (
    type.endsWith('smelting') || type.endsWith('blasting') || type.endsWith('smoking') || type.endsWith('stonecutting') || type.endsWith('smithing') ||
    (('ingredient' in rec || 'ingredients' in rec) && ('result' in rec || 'results' in rec))
  ) {
    const ing = rec.ingredient || rec.base || rec.input || rec.ingredients || rec.template;
    const addl = rec.addition || null;
    return { ...base, kind: 'process', inputs: normalizeIngredient(ing), addition: normalizeIngredient(addl) };
  }

  // Unknown type: try to infer crafting_shapeless
  if (rec.ingredients && Array.isArray(rec.ingredients)) {
    const grid = Array.from({ length: 9 }, () => []);
    rec.ingredients.map(normalizeIngredient).flat().forEach((opt, i) => { if (i < 9) grid[i] = [opt]; });
    return { ...base, kind: 'shapeless', grid };
  }

  return { ...base, kind: 'unknown' };
}

// Rendering helpers
function slotLabel(options) {
  if (!options || options.length === 0) return '';
  const names = options.map((o) => (o.item ? fmtItemLabel(o.item) : `#${o.tag}`));
  return names.join(' / ');
}

function renderGrid(grid, out, dims) {
  const wrap = document.createElement('div');
  const cols = dims?.cols || 3;
  const rows = dims?.rows || 3;
  const total = rows * cols;
  wrap.className = 'grid' + (dims ? ' dynamic' : '');
  if (dims) wrap.style.gridTemplateColumns = `repeat(${cols}, 64px)`;
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('div');
    const opts = grid[i] || [];
    cell.className = 'slot' + (opts.length === 0 ? ' empty' : '');
    cell.textContent = slotLabel(opts) || '';
    wrap.appendChild(cell);
  }
  // Output slot (not part of grid)
  const outRow = document.createElement('div');
  outRow.className = 'io';
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '→';
  const outSlot = document.createElement('div');
  outSlot.className = 'slot';
  outSlot.textContent = `${fmtItemLabel(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;
  outRow.appendChild(arrow);
  outRow.appendChild(outSlot);
  const container = document.createElement('div');
  container.appendChild(wrap);
  container.appendChild(outRow);
  return container;
}

function renderProcess(inputs, addition, out) {
  const cont = document.createElement('div');
  cont.className = 'io';
  const inWrap = document.createElement('div');
  inWrap.className = 'grid';
  const first = document.createElement('div');
  first.className = 'slot';
  first.textContent = slotLabel(inputs);
  inWrap.appendChild(first);
  if (addition && addition.length) {
    const plus = document.createElement('div');
    plus.className = 'slot';
    plus.textContent = slotLabel(addition);
    inWrap.appendChild(plus);
  }
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '→';
  const outSlot = document.createElement('div');
  outSlot.className = 'slot';
  outSlot.textContent = `${fmtItemLabel(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;
  cont.appendChild(inWrap);
  cont.appendChild(arrow);
  cont.appendChild(outSlot);
  return cont;
}

function renderGunsmith(materials, out) {
  const cont = document.createElement('div');
  cont.className = 'io';
  const mats = document.createElement('div');
  mats.className = 'grid';
  // Render up to 9 materials in a 3x3 grid; overflow continues new grids
  const chunks = [];
  for (let i = 0; i < materials.length; i += 9) chunks.push(materials.slice(i, i + 9));
  const wrap = document.createElement('div');
  chunks.forEach((chunk, ci) => {
    const g = document.createElement('div');
    g.className = 'grid';
    for (let i = 0; i < 9; i++) {
      const m = chunk[i];
      const cell = document.createElement('div');
      cell.className = 'slot' + (!m ? ' empty' : '');
      cell.textContent = m ? `${slotLabel(m.options)}${m.count && m.count !== 1 ? ` ×${m.count}` : ''}` : '';
      g.appendChild(cell);
    }
    wrap.appendChild(g);
  });

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '→';
  const outSlot = document.createElement('div');
  outSlot.className = 'slot';
  outSlot.textContent = `${fmtId(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;

  cont.appendChild(wrap);
  cont.appendChild(arrow);
  cont.appendChild(outSlot);
  return cont;
}

function renderSimpleProcess(rec, out) {
  const cont = document.createElement('div');
  cont.className = 'io';
  const inWrap = document.createElement('div');
  inWrap.className = 'grid';
  const first = document.createElement('div'); first.className = 'slot'; first.textContent = slotLabel(rec.inputs);
  inWrap.appendChild(first);
  const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
  const outSlot = document.createElement('div'); outSlot.className = 'slot'; outSlot.textContent = `${fmtItemLabel(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;
  cont.appendChild(inWrap); cont.appendChild(arrow); cont.appendChild(outSlot);
  if (Array.isArray(rec.resultsList) && rec.resultsList.length > 1) {
    const r = document.createElement('div'); r.className = 'step';
    const label = document.createElement('span'); label.className = 'badge'; label.textContent = 'Results';
    r.appendChild(label);
    rec.resultsList.forEach((rv) => {
      const s = document.createElement('span'); s.className = 'result-badge' + (rv.item === out.item ? ' highlight' : '');
      const chance = rv.chance != null ? ` • ${(rv.chance * 100).toFixed(0)}%` : '';
      s.textContent = `${fmtItemLabel(rv.item)} ×${rv.count || 1}${chance}`;
      r.appendChild(s);
    });
    cont.appendChild(r);
  }
  return cont;
}

function renderSmithing(rec, out) {
  const cont = document.createElement('div');
  cont.className = 'io';
  const t = document.createElement('div'); t.className = 'slot'; t.textContent = slotLabel(rec.tmpl);
  const b = document.createElement('div'); b.className = 'slot'; b.textContent = slotLabel(rec.baseIn);
  const a = document.createElement('div'); a.className = 'slot'; a.textContent = slotLabel(rec.add);
  const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
  const o = document.createElement('div'); o.className = 'slot'; o.textContent = `${fmtItemLabel(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;
  const wrap = document.createElement('div'); wrap.className = 'grid dynamic'; wrap.style.gridTemplateColumns = 'repeat(4, 64px)';
  [t, b, a].forEach((x) => wrap.appendChild(x));
  cont.appendChild(wrap); cont.appendChild(arrow); cont.appendChild(o);
  return cont;
}

function actionLabel(a) {
  return a.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function renderSequenced(rec, out) {
  const cont = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'recipe-meta';
  header.textContent = `Sequenced Assembly • loops: ${rec.loops || 1}`;
  cont.appendChild(header);

  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'steps';

  // Start: base input -> transitional
  const start = document.createElement('div');
  start.className = 'step';
  const inSlot = document.createElement('div'); inSlot.className = 'slot'; inSlot.textContent = slotLabel(rec.baseInput);
  const arrow1 = document.createElement('span'); arrow1.className = 'arrow'; arrow1.textContent = '→';
  const transSlot = document.createElement('div'); transSlot.className = 'slot'; transSlot.textContent = fmtItemLabel(rec.transitional);
  start.appendChild(inSlot); start.appendChild(arrow1); start.appendChild(transSlot);
  stepsWrap.appendChild(start);

  // Sequence steps
  rec.steps.forEach((st, idx) => {
    const row = document.createElement('div');
    row.className = 'step';
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = `${idx + 1}. ${actionLabel(st.action)}`;
    const trans = document.createElement('div'); trans.className = 'slot'; trans.textContent = fmtItemLabel(rec.transitional);
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = st.extra && st.extra.length ? '+' : '→';
    row.appendChild(badge);
    row.appendChild(trans);
    if (st.extra && st.extra.length) {
      const extra = document.createElement('div'); extra.className = 'slot'; extra.textContent = slotLabel(st.extra);
      const arrow2 = document.createElement('span'); arrow2.className = 'arrow'; arrow2.textContent = '→';
      const trans2 = document.createElement('div'); trans2.className = 'slot'; trans2.textContent = fmtItemLabel(rec.transitional);
      row.appendChild(arrow);
      row.appendChild(extra);
      row.appendChild(arrow2);
      row.appendChild(trans2);
    } else {
      row.appendChild(arrow);
      const trans2 = document.createElement('div'); trans2.className = 'slot'; trans2.textContent = fmtItemLabel(rec.transitional);
      row.appendChild(trans2);
    }
    stepsWrap.appendChild(row);
  });

  cont.appendChild(stepsWrap);

  // Results list
  if (Array.isArray(rec.resultsList) && rec.resultsList.length) {
    const r = document.createElement('div');
    r.className = 'step';
    const label = document.createElement('span'); label.className = 'badge'; label.textContent = 'Results';
    r.appendChild(label);
    rec.resultsList.forEach((rv) => {
      const s = document.createElement('span');
      s.className = 'result-badge' + (rv.item === out.item ? ' highlight' : '');
      const chance = rv.chance != null ? ` • ${(rv.chance * 100).toFixed(0)}%` : '';
      s.textContent = `${fmtItemLabel(rv.item)} ×${rv.count || 1}${chance}`;
      r.appendChild(s);
    });
    cont.appendChild(r);
  }

  return cont;
}

// -------- Materials (BOM) calculation --------

function aggregate(map, key, n) {
  if (!key || !n) return;
  map.set(key, (map.get(key) || 0) + n);
}

function bomForRecipe(rec, craftsNeeded, visited = new Set()) {
  // Returns { items: Map('item:<id>'|'tag:<tag>': count), fluids: Map('fluid:<id>': amount) }
  const items = new Map();
  const fluids = new Map();

  function reduceTagToBase(tag, qty) {
    // Known reductions from tags to more original materials
    // planks -> logs (4 planks per log)
    if (tag === 'minecraft:planks') {
      const logs = 'minecraft:logs';
      const logsQty = Math.ceil(qty / 4);
      aggregate(items, `tag:${logs}`, logsQty);
      return true;
    }
    return false;
  }

  function addOptionList(opts, qty) {
    if (!opts || !opts.length) return;
    if (opts.length === 1 && opts[0].item) {
      const id = opts[0].item;
      // Recurse if craftable and not visited
      if (!visited.has(id) && state.byOutput.has(id)) {
        visited.add(id);
        const sub = chooseRecipeForBase(id);
        if (sub) {
          const outCount = sub.__out?.count || 1;
          const crafts = Math.ceil(qty / outCount);
          const subBom = bomForRecipe(sub, crafts, visited);
          // merge
          subBom.items.forEach((v, k) => aggregate(items, k, v));
          subBom.fluids.forEach((v, k) => aggregate(fluids, k, v));
          return;
        }
      }
      // Known item reductions if no recipe is available in pack
      if (reduceKnownItemToBase(id, qty)) return;
      aggregate(items, `item:${id}`, qty);
      return;
    }
    // Multiple options or a single tag
    if (opts.length === 1 && opts[0].tag) {
      const t = opts[0].tag;
      if (!reduceTagToBase(t, qty)) {
        aggregate(items, `tag:${t}`, qty);
      }
      return;
    }
    const tag = `any:${opts.map((o) => o.item || ('#' + o.tag)).join('/')}`;
    aggregate(items, tag, qty);
  }

  if (rec.kind === 'shaped' || rec.kind === 'shapeless') {
    rec.grid.forEach((opts) => addOptionList(opts, craftsNeeded));
  } else if (rec.kind === 'process') {
    addOptionList(rec.inputs || [], craftsNeeded);
    addOptionList(rec.addition || [], craftsNeeded);
  } else if (rec.kind === 'gunsmith') {
    (rec.materials || []).forEach((m) => addOptionList(m.options, (m.count || 1) * craftsNeeded));
  } else if (rec.kind === 'sequenced') {
    // Base input once per craft
    addOptionList(rec.baseInput || [], craftsNeeded);
    const loops = rec.loops || 1;
    (rec.steps || []).forEach((st) => {
      addOptionList(st.extra || [], craftsNeeded * loops);
      // Fluids from steps
      if (st.extraFluids && st.extraFluids.length) {
        st.extraFluids.forEach((f) => aggregate(fluids, `fluid:${f.id}`, (f.amount || 0) * craftsNeeded));
      }
    });
  } else if (rec.kind === 'simple') {
    addOptionList(rec.inputs || [], craftsNeeded);
  } else if (rec.kind === 'smithing') {
    addOptionList(rec.tmpl || [], craftsNeeded);
    addOptionList(rec.baseIn || [], craftsNeeded);
    addOptionList(rec.add || [], craftsNeeded);
  }

  return { items, fluids };
}

function recipeScoreForBase(itemId, rec) {
  // Prefer recipes that move toward raw resources (ore/logs) over recombinations (nuggets->ingot)
  const kindScore = { shaped: 3, shapeless: 3, gunsmith: 2, sequenced: 2, process: 2, unknown: 0 }[rec.kind] || 0;
  let score = kindScore;
  const type = String(rec.type || '').toLowerCase();
  const id = String(itemId);
  const inputTags = [];
  if (rec.kind === 'shaped' || rec.kind === 'shapeless') {
    (rec.grid || []).forEach((g) => g && g.forEach((o) => { if (o.tag) inputTags.push(o.tag); }));
  } else if (rec.kind === 'process') {
    (rec.inputs || []).forEach((o) => { if (o.tag) inputTags.push(o.tag); });
  } else if (rec.kind === 'sequenced') {
    (rec.baseInput || []).forEach((o) => { if (o.tag) inputTags.push(o.tag); });
  }
  const hasOre = inputTags.some((t) => /(^|[:/])ores\//.test(t));
  const hasRaw = inputTags.some((t) => /raw(_materials)?\//.test(t));
  const hasNuggets = inputTags.some((t) => /nuggets\//.test(t));
  if ((/smelt|blast|smoking|stonecut/.test(type)) && (hasOre || hasRaw)) score += 6;
  if (/ingot/.test(id) && rec.kind === 'process') score += 2;
  if (hasNuggets) score -= 2;
  // Prefer deterministic outputs over chance-based byproducts
  if (rec.kind === 'sequenced' && Array.isArray(rec.resultsList)) {
    const entry = rec.resultsList.find((r) => r.item === itemId);
    if (entry && entry.chance != null && entry.chance < 100) score -= 12;
  }
  // Mild preference for fewer and simpler inputs
  let inputCount = 0;
  if (rec.kind === 'shaped' || rec.kind === 'shapeless') inputCount = (rec.grid || []).filter((g) => g && g.length).length;
  else if (rec.kind === 'process') inputCount = (rec.inputs || []).length + (rec.addition || []).length;
  else if (rec.kind === 'gunsmith') inputCount = (rec.materials || []).length;
  else if (rec.kind === 'sequenced') inputCount = 1 + (rec.steps || []).filter((s) => s.extra && s.extra.length).length;
  score -= Math.max(0, inputCount - 2) * 0.5;

  // Heuristic: for Create Shaft, prefer cutting Andesite Alloy
  if (id === 'create:shaft' && type.includes('cutting')) score += 8;
  return score;
}

function chooseRecipeForBase(itemId) {
  const rs = state.byOutput.get(itemId);
  if (!rs || !rs.length) return null;
  return rs.slice().sort((a, b) => recipeScoreForBase(itemId, b) - recipeScoreForBase(itemId, a)).find(() => true);
}

function reduceKnownItemToBase(id, qty) {
  // Fallback reductions for well-known components when no recipe is indexed
  if (id === 'create:cogwheel') {
    // 1 Cogwheel = 1 Andesite Alloy + 1 Planks
    aggregate(items, 'item:create:andesite_alloy', qty);
    reduceTagToBase('minecraft:planks', qty) || aggregate(items, 'tag:minecraft:planks', qty);
    return true;
  }
  if (id === 'create:large_cogwheel') {
    // 1 Large Cogwheel = 1 Andesite Alloy + 1 Shaft
    aggregate(items, 'item:create:andesite_alloy', qty);
    // Recurse into shaft via known reduction if recipe missing
    if (!state.byOutput.has('create:shaft')) {
      // 1 Andesite Alloy -> 6 Shafts (cutting), so need ceil(qty/6) alloy
      const crafts = Math.ceil(qty / 6);
      aggregate(items, 'item:create:andesite_alloy', crafts);
    } else {
      // Let addOptionList handle a virtual request for shafts
      const sub = chooseRecipeForBase('create:shaft');
      if (sub) {
        const outCount = sub.__out?.count || 1;
        const crafts = Math.ceil(qty / outCount);
        const subBom = bomForRecipe(sub, crafts, new Set([id]));
        subBom.items.forEach((v, k) => aggregate(items, k, v));
        subBom.fluids.forEach((v, k) => aggregate(fluids, k, v));
      } else {
        aggregate(items, 'item:create:shaft', qty);
      }
    }
    return true;
  }
  return false;
}

function alternativesFor(itemId, count) {
  // Provide user-friendly alternatives for common transforms (ingots/sheets)
  const alts = [];
  // Ingot alternatives via recipes: ores/raws at 1:1, nuggets at 9:1
  const m = itemId.match(/^(?:[\w-]+:)?([a-z0-9_]+)_ingot$/);
  if (m) {
    const metal = m[1].replace(/^gold$/, 'gold');
    const oreName = `${metal.replace('_', ' ')} ore`;
    // Check nugget combine
    const nuggetLabel = `${humanizeItemId((itemId.startsWith('create:') ? 'minecraft' : 'minecraft') + ':' + metal + '_nugget')}`.replace(/^Minecraft: /, '');
    alts.push({ label: `${titleCaseWord(metal.replace(/_/g, ' '))} Ore`, qty: count });
    alts.push({ label: `${titleCaseWord(metal.replace(/_/g, ' '))} Nuggets`, qty: count * 9 });
    return alts;
  }
  // Sheets: 1 sheet = 1 ingot
  const s = itemId.match(/^(?:[\w-]+:)?([a-z0-9_]+)_sheet$/);
  if (s) {
    const metal = s[1].replace(/^golden$/, 'gold');
    const ingotId = (metal === 'brass' ? 'create' : 'minecraft') + `:${metal}_ingot`;
    const name = humanizeItemId(ingotId);
    alts.push({ label: name, qty: count });
    // cascade to ingot alternatives
    const more = alternativesFor(ingotId, count);
    return [...alts, ...more];
  }
  return alts;
}

function renderBomList(mapItems, mapFluids) {
  const list = document.createElement('div');
  // Items
  const items = Array.from(mapItems.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  items.forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'step';
    const name = k.startsWith('item:') ? k.slice(5) : k.startsWith('tag:') ? `#${k.slice(4)}` : k.replace(/^any:/, 'Any of ');
    const left = document.createElement('div'); left.className = 'slot'; left.textContent = fmtItemLabel(name);
    const x = document.createElement('span'); x.className = 'arrow'; x.textContent = '×';
    const qty = document.createElement('span'); qty.className = 'badge'; qty.textContent = String(v);
    row.appendChild(left); row.appendChild(x); row.appendChild(qty);
    if (k.startsWith('item:')) {
      const alts = alternativesFor(k.slice(5), v);
      if (alts.length) {
        const altSpan = document.createElement('span');
        altSpan.className = 'result-badge';
        altSpan.textContent = ' ≈ ' + alts.map(a => `${a.qty} ${a.label}`).join(' / ');
        row.appendChild(altSpan);
      }
    }
    list.appendChild(row);
  });
  // Fluids
  const fluids = Array.from(mapFluids.entries());
  fluids.forEach(([k, v]) => {
    const row = document.createElement('div'); row.className = 'step';
    const name = k.slice(6);
    const left = document.createElement('div'); left.className = 'slot'; left.textContent = `${fmtItemLabel(name)} (fluid)`;
    const x = document.createElement('span'); x.className = 'arrow'; x.textContent = '×';
    const qty = document.createElement('span'); qty.className = 'badge'; qty.textContent = `${v} mb`;
    row.appendChild(left); row.appendChild(x); row.appendChild(qty);
    list.appendChild(row);
  });
  return list;
}

function renderRecipeCard(out, rec, opts = {}) {
  const { depth = 0, maxDepth = 3, visited = new Set() } = opts;
  const wrap = document.createElement('div');
  wrap.className = 'recipe-card';

  const header = document.createElement('div');
  header.className = 'recipe-header';
  const title = document.createElement('div');
  title.className = 'recipe-title';
  title.textContent = `${fmtItemLabel(out.item)}${out.count && out.count !== 1 ? ` ×${out.count}` : ''}`;
  const meta = document.createElement('div');
  meta.className = 'recipe-meta';
  meta.textContent = `${rec.type || 'crafting'}${rec.__source ? ` • ${rec.__source}` : ''}`;
  header.appendChild(title);
  header.appendChild(meta);
  wrap.appendChild(header);

  if (rec.kind === 'shaped' || rec.kind === 'shapeless') {
    wrap.appendChild(renderGrid(rec.grid, out, rec.dims));
  } else if (rec.kind === 'process') {
    wrap.appendChild(renderProcess(rec.inputs || [], rec.addition || [], out));
  } else if (rec.kind === 'gunsmith') {
    wrap.appendChild(renderGunsmith(rec.materials || [], out));
  } else if (rec.kind === 'sequenced') {
    wrap.appendChild(renderSequenced(rec, out));
  } else if (rec.kind === 'simple') {
    wrap.appendChild(renderSimpleProcess(rec, out));
  } else if (rec.kind === 'smithing') {
    wrap.appendChild(renderSmithing(rec, out));
  } else {
    const p = document.createElement('p');
    p.textContent = 'Unsupported or unknown recipe type.';
    wrap.appendChild(p);
  }

  // Expand sub-recipes (recursive) for single-option item inputs only
  if (depth < maxDepth) {
    const sub = document.createElement('div');
    sub.className = 'subrecipes';
    let expandedAny = false;

    const pushSub = (id) => {
      if (!id) return;
      if (visited.has(id)) return; // prevent cycles
      const next = state.byOutput.get(id);
      if (!next || next.length === 0) return;
      expandedAny = true;
      const innerHeader = document.createElement('div');
      innerHeader.className = 'recipe-meta';
      innerHeader.textContent = `Ingredients for ${id}`;
      sub.appendChild(innerHeader);
      const newVisited = new Set(visited);
      newVisited.add(id);
      next.forEach((n) => {
        sub.appendChild(
          renderRecipeCard({ item: id, count: 1 }, n, { depth: depth + 1, maxDepth, visited: newVisited })
        );
      });
    };

    if (rec.kind === 'shaped' || rec.kind === 'shapeless') {
      rec.grid.forEach((opts) => {
        if (opts.length === 1 && opts[0].item) pushSub(opts[0].item);
      });
    } else if (rec.kind === 'process') {
      if ((rec.inputs || []).length === 1 && rec.inputs[0].item) pushSub(rec.inputs[0].item);
      if ((rec.addition || []).length === 1 && rec.addition[0].item) pushSub(rec.addition[0].item);
    } else if (rec.kind === 'gunsmith') {
      (rec.materials || []).forEach((m) => {
        if (m && Array.isArray(m.options) && m.options.length === 1 && m.options[0].item) {
          pushSub(m.options[0].item);
        }
      });
    } else if (rec.kind === 'sequenced') {
      // Expand base input and extra ingredients where single-item
      if ((rec.baseInput || []).length === 1 && rec.baseInput[0].item) pushSub(rec.baseInput[0].item);
      (rec.steps || []).forEach((st) => {
        if (st.extra && st.extra.length === 1 && st.extra[0].item && !String(st.extra[0].item).startsWith('fluid:')) {
          pushSub(st.extra[0].item);
        }
      });
    }

    if (expandedAny) {
      const toggle = document.createElement('button');
      toggle.className = 'collapse-btn';
      toggle.textContent = 'Hide/Show Ingredients';
      toggle.addEventListener('click', () => {
        sub.hidden = !sub.hidden;
      });
      wrap.appendChild(toggle);
      wrap.appendChild(sub);
    }
  }

  return wrap;
}

function showItem(id, maxDepth) {
  clearResults();
  const recipes = state.byOutput.get(id);
  if (!recipes || recipes.length === 0) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = `No recipes found for ${id}.`;
    els.results.appendChild(p);
    return;
  }
  const visited = new Set([id]);
  // If multiple recipes, render selector
  if (recipes.length > 1) {
    const ctrl = document.createElement('div');
    ctrl.className = 'multi-controls';
    const label = document.createElement('span');
    label.textContent = `${recipes.length} recipes found for ${fmtItemLabel(id)}`;
    const select = document.createElement('select');
    recipes.forEach((rec, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      const t = String(rec.type || 'crafting');
      opt.textContent = `Recipe ${i + 1}: ${t}`;
      select.appendChild(opt);
    });
    const showAll = document.createElement('label');
    showAll.innerHTML = 'Show all <input type="checkbox" id="showAllChk" />';
    ctrl.appendChild(label);
    ctrl.appendChild(select);
    ctrl.appendChild(showAll);
    els.results.appendChild(ctrl);

    const cards = recipes.map((rec) =>
      renderRecipeCard({ item: id, count: rec.__out?.count || 1 }, rec, { depth: 0, maxDepth, visited })
    );
    cards.forEach((c, idx) => {
      if (idx !== 0) c.style.display = 'none';
      els.results.appendChild(c);
    });

    select.addEventListener('change', () => {
      const i = parseInt(select.value, 10) || 0;
      const all = ctrl.querySelector('#showAllChk');
      if (all && all.checked) return; // showing all; ignore
      cards.forEach((c, idx) => (c.style.display = idx === i ? '' : 'none'));
    });
    ctrl.querySelector('#showAllChk').addEventListener('change', (e) => {
      const on = e.target.checked;
      if (on) {
        cards.forEach((c) => (c.style.display = ''));
      } else {
        const i = parseInt(select.value, 10) || 0;
        cards.forEach((c, idx) => (c.style.display = idx === i ? '' : 'none'));
      }
    });
  } else {
    // Single recipe
    const rec = recipes[0];
    els.results.appendChild(
      renderRecipeCard({ item: id, count: rec.__out?.count || 1 }, rec, { depth: 0, maxDepth, visited })
    );
  }
}

// Loading files
async function readFiles(fileList) {
  const files = Array.from(fileList || []).filter(isJsonFile);
  if (!files.length) return { total: 0, parsed: 0, errors: 0 };
  setStatus(`Reading ${files.length} files...`);
  let parsed = 0, errors = 0;
  for (const f of files) {
    try {
      const text = await f.text();
      try {
        const json = JSON.parse(text);
        // Some packs wrap recipes; accept single or array
        if (Array.isArray(json)) {
          json.forEach((r, i) => ingestRecipe(r, `${f.webkitRelativePath || f.name}#${i}`));
        } else {
          ingestRecipe(json, f.webkitRelativePath || f.name);
        }
        parsed++;
      } catch (e) {
        console.warn('JSON parse failed', f.name, e);
        errors++;
      }
    } catch (e) {
      console.warn('Read failed', f.name, e);
      errors++;
    }
  }
  els.showBtn.disabled = state.allOutputs.size === 0;
  els.searchNote.textContent = `${state.allOutputs.size} craftable outputs loaded`;
  setStatus(`Loaded ${parsed}/${files.length} files. ${errors ? errors + ' errors.' : ''}`);
  return { total: files.length, parsed, errors };
}

// Event wiring
els.folderInput.addEventListener('change', async (e) => {
  await readFiles(e.target.files);
});

els.filesInput.addEventListener('change', async (e) => {
  await readFiles(e.target.files);
});

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(ev => {
  els.dropZone.addEventListener(ev, preventDefaults, false);
});
['dragenter','dragover'].forEach(ev => {
  els.dropZone.addEventListener(ev, () => els.dropZone.classList.add('drag'));
});
['dragleave','drop'].forEach(ev => {
  els.dropZone.addEventListener(ev, () => els.dropZone.classList.remove('drag'));
});
els.dropZone.addEventListener('drop', async (e) => {
  const dt = e.dataTransfer;
  if (dt?.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
    // Traverse directories from DataTransferItemList
    const items = Array.from(dt.items);
    const files = await traverseItems(items);
    await readFiles(files);
  } else {
    await readFiles(dt.files);
  }
});

// Traverse directories dropped via drag-and-drop (Chrome/WebKit)
async function traverseItems(items) {
  const filePromises = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (!entry) continue;
    filePromises.push(...await traverseEntry(entry));
  }
  const files = await Promise.all(filePromises);
  return files.filter(Boolean);
}

async function traverseEntry(entry) {
  if (entry.isFile) {
    return [new Promise((resolve) => entry.file(resolve))];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    const nested = await Promise.all(entries.map(traverseEntry));
    return nested.flat();
  }
  return [];
}

els.showBtn.addEventListener('click', () => {
  const id = els.searchInput.value.trim();
  if (!id) return;
  const maxDepth = clamp(parseInt(els.depthInput.value || '3', 10), 1, 12);
  showItem(id, maxDepth);
});

els.searchInput.addEventListener('input', (e) => {
  els.showBtn.disabled = !e.target.value.trim();
});

els.depthInput.addEventListener('input', (e) => {
  els.depthValue.textContent = e.target.value;
});

els.displayToggle.addEventListener('change', (e) => {
  state.displayMode = e.target.checked ? 'name' : 'id';
  // Rerender current view if any
  const current = els.searchInput.value.trim();
  if (current) {
    const maxDepth = clamp(parseInt(els.depthInput.value || '3', 10), 1, 12);
    showItem(current, maxDepth);
  }
});

// Auto-ingest embedded recipes if present (hardcoded bundle)
window.addEventListener('DOMContentLoaded', () => {
  if (Array.isArray(window.EMBEDDED_RECIPES) && window.EMBEDDED_RECIPES.length) {
    try {
      window.EMBEDDED_RECIPES.forEach((r, i) => ingestRecipe(r, r.__source || `embedded#${i}`));
      els.showBtn.disabled = state.allOutputs.size === 0;
      els.searchNote.textContent = `${state.allOutputs.size} craftable outputs loaded (embedded)`;
      setStatus('Embedded recipes loaded.');
      const loader = document.querySelector('.loader');
      if (loader) loader.style.display = 'none';
    } catch (e) {
      console.error('Failed to load EMBEDDED_RECIPES', e);
      setStatus('Failed to load embedded recipes', true);
    }
  }
});

// End
