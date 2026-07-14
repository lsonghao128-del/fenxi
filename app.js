const DATA = window.PRODUCT_ANALYSIS_DATA;

const state = {
  mode: "analysis",
  category: "主食",
  drinkView: "detail",
  selectedId: null,
  chartView: null,
  panStart: null,
  hiddenColumns: new Set(),
  sorts: {},
};

const orderedQuadrants = ["highHigh", "highLow", "lowHigh", "lowLow"];
const leftQuadrants = ["lowHigh", "lowLow"];
const rightQuadrants = ["highHigh", "highLow"];

const chart = document.getElementById("quadrant-chart");
const tooltip = document.getElementById("tooltip");
const leftTables = document.getElementById("left-tables");
const rightTables = document.getElementById("right-tables");
const legend = document.getElementById("legend");
const chartTitle = document.getElementById("chart-title");
const chartSubtitle = document.getElementById("chart-subtitle");
const totalTable = document.getElementById("total-table");
const totalTableHead = document.querySelector("#total-table thead");
const totalTableBody = document.querySelector("#total-table tbody");
const columnControls = document.getElementById("column-controls");
const searchInput = document.getElementById("search-input");
const categoryFilter = document.getElementById("category-filter");
const analysisSearchInput = document.getElementById("analysis-search");
const analysisSearchList = document.getElementById("analysis-search-list");
const analysisSearchStatus = document.getElementById("analysis-search-status");
const drinkViewBar = document.getElementById("drink-view-bar");

let drinkSummaryDatasetCache = null;

const fmtInt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const fmtMoney = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const totalColumns = [
  { key: "rank", label: "排名", width: 64, locked: true, render: (_, index) => index + 1 },
  { key: "category", label: "分类", width: 80, render: (item) => escapeHtml(item.category) },
  { key: "nameCn", label: "中文商品名称", width: 150, render: (item) => escapeHtml(item.nameCn) },
  { key: "nameEn", label: "印尼商品名称", width: 180, render: (item) => escapeHtml(item.nameEn) },
  { key: "spec", label: "规格", width: 90, render: (item) => escapeHtml(item.spec) },
  { key: "price", label: "定价", width: 105, sortable: true, render: (item) => fmtMoney.format(item.price) },
  { key: "cost", label: "成本", width: 105, sortable: true, render: (item) => fmtMoney.format(item.cost) },
  { key: "margin", label: "利率", width: 90, sortable: true, render: (item) => fmtPct.format(item.margin) },
  { key: "grossProfit", label: "总毛利额", width: 130, sortable: true, render: (item) => fmtMoney.format(item.grossProfit) },
  { key: "sales", label: "销量", width: 90, sortable: true, render: (item) => fmtInt.format(item.sales) },
  { key: "netRevenue", label: "实收金额", width: 130, sortable: true, render: (item) => fmtMoney.format(item.netRevenue) },
  { key: "grossOrder", label: "原单金额", width: 130, sortable: true, render: (item) => fmtMoney.format(item.grossOrder) },
  { key: "productAmount", label: "商品金额", width: 130, sortable: true, render: (item) => fmtMoney.format(item.productAmount) },
  { key: "tax", label: "税额", width: 105, sortable: true, render: (item) => fmtMoney.format(item.tax) },
];

function activeDataset() {
  if (state.category === "饮品" && state.drinkView === "summary") {
    if (!drinkSummaryDatasetCache) {
      drinkSummaryDatasetCache = buildDrinkSummaryDataset();
    }
    return drinkSummaryDatasetCache;
  }
  return DATA.categoryDatasets[state.category];
}

function setMode(mode) {
  clearSelection();
  state.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  document.getElementById("analysis-view").hidden = mode !== "analysis";
  document.getElementById("raw-view").hidden = mode !== "raw";

  if (mode === "analysis") {
    renderAnalysis();
  } else {
    renderTotalTable();
  }
}

function setCategory(category) {
  clearSelection();
  state.category = category;
  analysisSearchInput.value = "";
  analysisSearchStatus.textContent = "";
  document.querySelectorAll(".type-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === category);
  });
  renderDrinkViewControls();
  renderAnalysis();
}

function setDrinkView(view) {
  clearSelection();
  state.drinkView = view;
  analysisSearchInput.value = "";
  analysisSearchStatus.textContent = "";
  renderDrinkViewControls();
  renderAnalysis();
}

function renderDrinkViewControls() {
  const isDrink = state.category === "饮品";
  drinkViewBar.hidden = !isDrink;
  document.querySelectorAll(".drink-view-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.drinkView === state.drinkView);
  });
}

function renderAnalysis() {
  resetChartView();
  const dataset = activeDataset();
  const items = dataset.items;
  const totalSales = items.reduce((sum, item) => sum + item.sales, 0);
  const avgMargin = items.reduce((sum, item) => sum + item.margin, 0) / items.length;

  document.getElementById("metric-count").textContent = fmtInt.format(items.length);
  document.getElementById("metric-sales").textContent = fmtInt.format(totalSales);
  document.getElementById("metric-margin").textContent = fmtPct.format(avgMargin);
  const titleLabel = state.category === "饮品" && state.drinkView === "detail" ? "饮品（规格明细）" : dataset.label;
  chartTitle.textContent = `${titleLabel}四象限`;
  chartSubtitle.textContent = `横轴：利率，纵轴：销量。分割线：利率中位数 ${fmtPct.format(dataset.xMid)}，销量中位数 ${fmtInt.format(dataset.yMid)}。`;

  renderLegend();
  renderAnalysisSearchOptions();
  renderSideTables();
  renderChart();
}

function renderLegend() {
  legend.innerHTML = orderedQuadrants
    .map((key) => `<span><i style="background:${DATA.quadrants[key].color}"></i>${DATA.quadrants[key].label}</span>`)
    .join("");
}

function renderAnalysisSearchOptions() {
  analysisSearchList.innerHTML = activeDataset().items
    .map((item) => `<option value="${escapeHtml(`${item.nameCn} ${item.spec}`)}">${escapeHtml(item.nameEn)} ${escapeHtml(item.spec)}</option>`)
    .join("");
}

function renderSideTables() {
  leftTables.innerHTML = leftQuadrants.map((key) => quadrantTable(key)).join("");
  rightTables.innerHTML = rightQuadrants.map((key) => quadrantTable(key)).join("");
  bindSideTableInteractions();
}

function quadrantTable(key) {
  const rows = activeDataset().items.filter((item) => item.quadrant === key).sort((a, b) => a.number - b.number);
  const range = rows.length ? `${rows[0].number}-${rows[rows.length - 1].number}` : "";
  return `
    <section class="quadrant-table" data-quadrant="${key}">
      <h3 style="background:${DATA.quadrants[key].color}">${DATA.quadrants[key].label} ${range}</h3>
      <ol class="quadrant-list">
        ${rows.map((item) => `
          <li data-id="${itemId(item)}">
            <span class="item-number">${String(item.number).padStart(2, "0")}.</span>
            <span class="item-name" title="${escapeHtml(item.nameCn)} / ${escapeHtml(item.nameEn)}">
              ${escapeHtml(item.nameCn)}
              <span class="item-spec">${escapeHtml(item.spec)}</span>
              <span class="item-meta">销量${fmtInt.format(item.sales)} 利率${fmtPct.format(item.margin)}</span>
            </span>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
}

function bindSideTableInteractions() {
  document.querySelectorAll(".quadrant-list li[data-id]").forEach((row) => {
    const item = findAnalysisItemById(row.dataset.id);
    if (!item) return;
    row.addEventListener("mouseenter", () => markActive(row.dataset.id));
    row.addEventListener("mouseleave", () => markActive(state.selectedId));
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      selectItem(item);
    });
  });
}

function renderChart() {
  const dataset = activeDataset();
  const items = dataset.items;
  const width = 860;
  const height = 640;
  const pad = { left: 64, right: 24, top: 28, bottom: 58 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const margins = items.map((item) => item.margin);
  const sales = items.map((item) => item.sales);
  const xMin = Math.min(...margins);
  const xMax = Math.max(...margins);
  const yMin = Math.min(...sales);
  const yMax = Math.max(...sales);
  const xPad = (xMax - xMin) * 0.12 || 0.04;
  const yPad = (yMax - yMin) * 0.12 || 20;
  const x0 = xMin - xPad;
  const x1 = xMax + xPad;
  const y0 = Math.max(0, yMin - yPad);
  const y1 = yMax + yPad;
  const sx = (x) => pad.left + ((x - x0) / (x1 - x0)) * innerW;
  const sy = (y) => pad.top + ((y1 - y) / (y1 - y0)) * innerH;
  const xMid = sx(dataset.xMid);
  const yMid = sy(dataset.yMid);

  if (!state.chartView) {
    state.chartView = { x: 0, y: 0, width, height, baseWidth: width, baseHeight: height };
  }
  applyChartView();
  chart.innerHTML = "";

  const frag = document.createDocumentFragment();
  frag.appendChild(svgEl("rect", {
    x: pad.left,
    y: pad.top,
    width: innerW,
    height: innerH,
    rx: 6,
    fill: "#fffdf8",
    stroke: "#d8d0c2",
  }));

  for (let i = 0; i <= 5; i += 1) {
    const x = pad.left + (innerW * i) / 5;
    const y = pad.top + (innerH * i) / 5;
    frag.appendChild(svgEl("line", { x1: x, y1: pad.top, x2: x, y2: pad.top + innerH, class: "grid-line" }));
    frag.appendChild(svgEl("line", { x1: pad.left, y1: y, x2: pad.left + innerW, y2: y, class: "grid-line" }));
    const xVal = x0 + ((x1 - x0) * i) / 5;
    const yVal = y1 - ((y1 - y0) * i) / 5;
    frag.appendChild(textEl(x, pad.top + innerH + 28, fmtPct.format(xVal), "tick-label", "middle"));
    frag.appendChild(textEl(pad.left - 16, y + 5, fmtInt.format(yVal), "tick-label", "end"));
  }

  frag.appendChild(svgEl("line", { x1: xMid, y1: pad.top, x2: xMid, y2: pad.top + innerH, class: "mid-line" }));
  frag.appendChild(svgEl("line", { x1: pad.left, y1: yMid, x2: pad.left + innerW, y2: yMid, class: "mid-line" }));
  frag.appendChild(textEl((pad.left + xMid) / 2, pad.top + 42, "低利率 / 高销量", "quadrant-label", "middle"));
  frag.appendChild(textEl((xMid + pad.left + innerW) / 2, pad.top + 42, "高利率 / 高销量", "quadrant-label", "middle"));
  frag.appendChild(textEl((pad.left + xMid) / 2, pad.top + innerH - 28, "低利率 / 低销量", "quadrant-label", "middle"));
  frag.appendChild(textEl((xMid + pad.left + innerW) / 2, pad.top + innerH - 28, "高利率 / 低销量", "quadrant-label", "middle"));
  frag.appendChild(textEl(pad.left + innerW / 2, height - 18, `利率（中位数 ${fmtPct.format(dataset.xMid)}）`, "axis-label", "middle"));
  const yAxis = textEl(18, pad.top + innerH / 2, `销量（中位数 ${fmtInt.format(dataset.yMid)}）`, "axis-label", "middle");
  yAxis.setAttribute("transform", `rotate(-90 18 ${pad.top + innerH / 2})`);
  frag.appendChild(yAxis);

  items.forEach((item) => {
    const group = svgEl("g", {
      class: "point",
      "data-id": itemId(item),
      transform: `translate(${sx(item.margin)} ${sy(item.sales)})`,
      role: "button",
      "aria-label": `${item.number} ${item.nameCn} 销量${item.sales} 利率${fmtPct.format(item.margin)}`,
    });
    group.appendChild(svgEl("circle", { r: 12, fill: DATA.quadrants[item.quadrant].color }));
    group.appendChild(textEl(0, 5, item.number, "", "middle"));
    group.addEventListener("mouseenter", (event) => showTooltip(event, item));
    group.addEventListener("mousemove", (event) => moveTooltip(event));
    group.addEventListener("mouseleave", hideTooltip);
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      selectItem(item);
    });
    frag.appendChild(group);
  });

  chart.appendChild(frag);
}

function resetChartView() {
  state.chartView = null;
}

function resetCurrentChartView() {
  if (!state.chartView) return;
  state.chartView.x = 0;
  state.chartView.y = 0;
  state.chartView.width = state.chartView.baseWidth;
  state.chartView.height = state.chartView.baseHeight;
  applyChartView();
}

function applyChartView() {
  const view = state.chartView;
  if (!view) return;
  chart.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
}

function zoomChart(factor, clientX, clientY) {
  if (!state.chartView) return;
  const view = state.chartView;
  const zoom = view.baseWidth / view.width;
  const nextZoom = Math.min(4, Math.max(1, zoom * factor));
  const nextWidth = view.baseWidth / nextZoom;
  const nextHeight = view.baseHeight / nextZoom;
  const box = chart.getBoundingClientRect();
  const px = typeof clientX === "number" ? (clientX - box.left) / box.width : 0.5;
  const py = typeof clientY === "number" ? (clientY - box.top) / box.height : 0.5;
  const focusX = view.x + view.width * px;
  const focusY = view.y + view.height * py;

  view.x = focusX - nextWidth * px;
  view.y = focusY - nextHeight * py;
  view.width = nextWidth;
  view.height = nextHeight;
  clampChartView();
  applyChartView();
}

function panChart(deltaX, deltaY) {
  if (!state.chartView) return;
  const view = state.chartView;
  const box = chart.getBoundingClientRect();
  view.x -= (deltaX / box.width) * view.width;
  view.y -= (deltaY / box.height) * view.height;
  clampChartView();
  applyChartView();
}

function clampChartView() {
  const view = state.chartView;
  if (!view) return;
  if (view.width >= view.baseWidth || view.height >= view.baseHeight) {
    view.x = 0;
    view.y = 0;
    view.width = view.baseWidth;
    view.height = view.baseHeight;
    return;
  }
  view.x = Math.max(0, Math.min(view.x, view.baseWidth - view.width));
  view.y = Math.max(0, Math.min(view.y, view.baseHeight - view.height));
}

function showTooltip(event, item, options = { scrollList: true }) {
  tooltip.hidden = false;
  tooltip.innerHTML = `
    <strong>${String(item.number).padStart(2, "0")}. ${escapeHtml(item.nameCn)}</strong>
    <div>${escapeHtml(item.nameEn)} / 规格：${escapeHtml(item.spec)}</div>
    ${item.specList ? `<div>包含规格：${escapeHtml(item.specList)}</div>` : ""}
    <div>分类：${escapeHtml(item.category)}</div>
    <div>销量：${fmtInt.format(item.sales)}</div>
    <div>利率：${fmtPct.format(item.margin)}</div>
    <div>总毛利额：${fmtMoney.format(item.grossProfit)}</div>
    <div>象限：${DATA.quadrants[item.quadrant].label}</div>
  `;
  moveTooltip(event);
  markActive(itemId(item), { scrollList: Boolean(options.scrollList) });
}

function moveTooltip(event) {
  const box = chart.getBoundingClientRect();
  const point = typeof event.clientX === "number" ? event : null;
  const targetBox = event.currentTarget ? event.currentTarget.getBoundingClientRect() : box;
  const x = point ? point.clientX - box.left : targetBox.left + targetBox.width / 2 - box.left;
  const y = point ? point.clientY - box.top : targetBox.top + targetBox.height / 2 - box.top;
  tooltip.style.left = `${Math.min(x + 18, box.width - 280)}px`;
  tooltip.style.top = `${Math.max(y - 18, 12)}px`;
}

function hideTooltip() {
  if (state.selectedId) {
    const selected = findAnalysisItemById(state.selectedId);
    if (selected) showTooltipForItem(selected, { scrollList: false });
    return;
  }
  clearSelection();
}

function selectItem(item) {
  state.selectedId = itemId(item);
  showTooltipForItem(item, { scrollList: true });
}

function showTooltipForItem(item, options = {}) {
  const point = document.querySelector(`.point[data-id="${CSS.escape(itemId(item))}"]`);
  if (!point) return;
  showTooltip({ currentTarget: point }, item, { scrollList: Boolean(options.scrollList) });
}

function clearSelection() {
  state.selectedId = null;
  tooltip.hidden = true;
  markActive(null);
}

function markActive(id, options = {}) {
  document.querySelectorAll("[data-id]").forEach((el) => {
    el.classList.toggle("active", id && el.dataset.id === id);
  });
  if (id && options.scrollList) {
    document.querySelector(`.quadrant-list li[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
  }
}

function handleAnalysisSearch() {
  const query = analysisSearchInput.value.trim().toLowerCase();
  if (!query) {
    analysisSearchStatus.textContent = "";
    clearSelection();
    return;
  }
  const matches = activeDataset().items.filter((item) => {
    const haystack = `${item.number} ${item.nameCn} ${item.nameEn} ${item.spec}`.toLowerCase();
    return haystack.includes(query);
  });
  if (!matches.length) {
    clearSelection();
    analysisSearchStatus.textContent = "没有找到对应商品";
    return;
  }
  const target = matches.find((item) => item.nameCn.toLowerCase() === query || item.nameEn.toLowerCase() === query || String(item.number) === query) || matches[0];
  selectItem(target);
  analysisSearchStatus.textContent = matches.length === 1 ? `已定位：${target.nameCn}` : `找到 ${matches.length} 个，已定位：${target.nameCn}`;
}

function buildDrinkSummaryDataset() {
  const groups = new Map();
  DATA.total
    .filter((item) => item.category === "饮品")
    .forEach((item) => {
      const key = `${item.nameCn}__${item.nameEn}`;
      if (!groups.has(key)) {
        groups.set(key, {
          category: "饮品",
          nameCn: item.nameCn,
          nameEn: item.nameEn,
          spec: "全部规格",
          specSet: new Set(),
          price: 0,
          cost: 0,
          grossProfit: 0,
          sales: 0,
          netRevenue: 0,
          grossOrder: 0,
          productAmount: 0,
          tax: 0,
        });
      }
      const group = groups.get(key);
      const sales = Number(item.sales) || 0;
      group.specSet.add(item.spec);
      group.price += (Number(item.price) || 0) * sales;
      group.cost += (Number(item.cost) || 0) * sales;
      group.grossProfit += Number(item.grossProfit) || 0;
      group.sales += sales;
      group.netRevenue += Number(item.netRevenue) || 0;
      group.grossOrder += Number(item.grossOrder) || 0;
      group.productAmount += Number(item.productAmount) || 0;
      group.tax += Number(item.tax) || 0;
    });

  const items = Array.from(groups.values()).map((item, index) => {
    const weightedSales = item.sales || 1;
    const productAmount = item.productAmount || 0;
    return {
      ...item,
      sourceIndex: index + 1,
      specList: Array.from(item.specSet).join(" / "),
      specSet: undefined,
      price: item.price / weightedSales,
      cost: item.cost / weightedSales,
      margin: productAmount ? item.grossProfit / productAmount : 0,
    };
  });
  return buildDatasetFromItems("饮品（商品汇总）", items);
}

function buildDatasetFromItems(label, sourceItems) {
  const items = sourceItems.map((item) => ({ ...item }));
  const xMid = median(items.map((item) => item.margin));
  const yMid = median(items.map((item) => item.sales));
  items.forEach((item) => {
    const highMargin = item.margin >= xMid;
    const highSales = item.sales >= yMid;
    if (highMargin && highSales) item.quadrant = "highHigh";
    else if (highMargin) item.quadrant = "highLow";
    else if (highSales) item.quadrant = "lowHigh";
    else item.quadrant = "lowLow";
  });

  const numbered = [];
  let number = 1;
  orderedQuadrants.forEach((quadrant) => {
    items
      .filter((item) => item.quadrant === quadrant)
      .sort((a, b) => b.sales - a.sales || b.margin - a.margin || a.nameCn.localeCompare(b.nameCn))
      .forEach((item) => {
        item.number = number;
        number += 1;
        numbered.push(item);
      });
  });
  return { label, xMid, yMid, items: numbered };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (!sorted.length) return 0;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function renderTotalTable() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const visibleColumns = totalColumns.filter((column) => column.locked || !state.hiddenColumns.has(column.key));
  const rows = applySort(
    "total",
    DATA.total.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const haystack = `${item.category} ${item.nameCn} ${item.nameEn} ${item.spec}`.toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    }),
    (a, b) => b.sales - a.sales
  );

  totalTableHead.innerHTML = `
    <tr>
      ${visibleColumns.map((column) => `
        <th>${column.sortable ? sortButton("total", column.key, column.label) : escapeHtml(column.label)}</th>
      `).join("")}
    </tr>
  `;
  totalTableBody.innerHTML = rows
    .map((item, index) => `
      <tr>
        ${visibleColumns.map((column) => `<td>${column.render(item, index)}</td>`).join("")}
      </tr>
    `)
    .join("");
  updateTotalTableWidth(visibleColumns);
  updateSortButtons();
}

function renderColumnControls() {
  columnControls.innerHTML = `
    <div class="column-controls-head">
      <span>显示字段</span>
      <button type="button" id="show-all-columns">全部显示</button>
    </div>
    <div class="column-toggle-grid">
      ${totalColumns.map((column) => `
        <label class="column-toggle ${column.locked ? "locked" : ""}">
          <input
            type="checkbox"
            data-column-key="${column.key}"
            ${column.locked ? "disabled" : ""}
            ${column.locked || !state.hiddenColumns.has(column.key) ? "checked" : ""}
          />
          <span>${escapeHtml(column.label)}</span>
        </label>
      `).join("")}
    </div>
  `;

  columnControls.querySelectorAll("input[data-column-key]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.columnKey;
      if (input.checked) state.hiddenColumns.delete(key);
      else {
        state.hiddenColumns.add(key);
        if (state.sorts.total?.field === key) delete state.sorts.total;
      }
      renderColumnControls();
      renderTotalTable();
    });
  });

  document.getElementById("show-all-columns").addEventListener("click", () => {
    state.hiddenColumns.clear();
    renderColumnControls();
    renderTotalTable();
  });
}

function updateTotalTableWidth(visibleColumns) {
  const minWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0);
  totalTable.style.minWidth = `${Math.max(560, minWidth)}px`;
}

function applySort(tableKey, rows, fallback) {
  const sorted = [...rows].sort(fallback);
  const sort = state.sorts[tableKey];
  if (!sort) return sorted;
  sorted.sort((a, b) => {
    const av = Number(a[sort.field]);
    const bv = Number(b[sort.field]);
    if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
    if (Number.isNaN(av)) return 1;
    if (Number.isNaN(bv)) return -1;
    return sort.direction === "asc" ? av - bv : bv - av;
  });
  return sorted;
}

function toggleSort(tableKey, field) {
  const current = state.sorts[tableKey];
  const direction = current?.field === field && current.direction === "desc" ? "asc" : "desc";
  state.sorts[tableKey] = { field, direction };
  renderTotalTable();
}

function sortButton(tableKey, field, label) {
  const sort = state.sorts[tableKey];
  const active = sort?.field === field;
  const arrow = active ? (sort.direction === "desc" ? "↓" : "↑") : "↕";
  return `<button class="sort-button ${active ? "active" : ""}" type="button" data-sort-table="${tableKey}" data-sort-field="${field}">${escapeHtml(label)} <span>${arrow}</span></button>`;
}

function updateSortButtons() {
  document.querySelectorAll(".sort-button").forEach((button) => {
    const sort = state.sorts[button.dataset.sortTable];
    const active = sort?.field === button.dataset.sortField;
    button.classList.toggle("active", Boolean(active));
    const icon = button.querySelector("span");
    if (icon) icon.textContent = active ? (sort.direction === "desc" ? "↓" : "↑") : "↕";
  });
}

function findAnalysisItemById(id) {
  return activeDataset().items.find((item) => itemId(item) === id);
}

function itemId(item) {
  return `${item.category}-${item.number}`;
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function textEl(x, y, text, className, anchor) {
  const el = svgEl("text", { x, y, "text-anchor": anchor });
  if (className) el.setAttribute("class", className);
  el.textContent = text;
  return el;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll(".type-button").forEach((button) => {
  button.addEventListener("click", () => setCategory(button.dataset.category));
});

document.querySelectorAll(".drink-view-button").forEach((button) => {
  button.addEventListener("click", () => setDrinkView(button.dataset.drinkView));
});

document.querySelectorAll("[data-zoom-action]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const action = button.dataset.zoomAction;
    if (action === "in") zoomChart(1.25);
    if (action === "out") zoomChart(0.8);
    if (action === "reset") resetCurrentChartView();
  });
});

analysisSearchInput.addEventListener("input", handleAnalysisSearch);
searchInput.addEventListener("input", renderTotalTable);
categoryFilter.addEventListener("change", renderTotalTable);

chart.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomChart(event.deltaY < 0 ? 1.12 : 0.9, event.clientX, event.clientY);
}, { passive: false });

chart.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".point")) return;
  state.panStart = { x: event.clientX, y: event.clientY };
  chart.classList.add("panning");
  chart.setPointerCapture(event.pointerId);
});

chart.addEventListener("pointermove", (event) => {
  if (!state.panStart) return;
  const deltaX = event.clientX - state.panStart.x;
  const deltaY = event.clientY - state.panStart.y;
  state.panStart = { x: event.clientX, y: event.clientY };
  panChart(deltaX, deltaY);
});

chart.addEventListener("pointerup", (event) => {
  state.panStart = null;
  chart.classList.remove("panning");
  if (chart.hasPointerCapture(event.pointerId)) {
    chart.releasePointerCapture(event.pointerId);
  }
});

chart.addEventListener("pointerleave", () => {
  state.panStart = null;
  chart.classList.remove("panning");
});

document.addEventListener("click", (event) => {
  const sort = event.target.closest(".sort-button");
  if (sort) {
    event.stopPropagation();
    toggleSort(sort.dataset.sortTable, sort.dataset.sortField);
    return;
  }
  if (
    event.target.closest(".point") ||
    event.target.closest(".quadrant-list li") ||
    event.target.closest(".tooltip") ||
    event.target.closest(".chart-search") ||
    event.target.closest(".zoom-controls")
  ) {
    return;
  }
  clearSelection();
});

renderDrinkViewControls();
renderAnalysis();
renderColumnControls();
renderTotalTable();
