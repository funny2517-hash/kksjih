import * as d3 from "d3";
import {
  loadRecords,
  saveRecord,
  deleteRecord,
  importRecords,
} from "./storage.js";
import {
  validateRecord,
  parseBackup,
  makeBackup,
  sortRecords,
  MAX_PHOTOS,
} from "./records.js";
import { preparePhoto } from "./photo.js";
import "./style.css";
import {
  targetForFeature,
  recordTargets,
  recordsForTarget,
} from "./geography.js";
const $ = (s) => document.querySelector(s);
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let currentProvince = null;
let geo,
  rests,
  records = [],
  targets = new Map(),
  tab = "region",
  selected = null,
  query = "",
  visitedOnly = false,
  route = "",
  editing = null,
  photos = [],
  dirty = false,
  busy = false,
  pendingImport = [];
let svg,
  g,
  projection,
  path,
  zoom,
  transform = d3.zoomIdentity,
  regionPaths,
  labelLayer,
  markerLayer;
function notify(message, error = false) {
  const el = $("#notice");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (el.hidden = true), 6000);
}
function errorMessage(e) {
  console.error(e);
  return e?.name === "QuotaExceededError"
    ? "저장 공간이 부족합니다. 먼저 백업하고 불필요한 사진을 줄여 주세요."
    : e.message || "작업에 실패했습니다. 다시 시도해 주세요.";
}
const listRecords = (id) =>
  sortRecords(recordsForTarget(records, targets.get(id)));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function start() {
  const responses = await Promise.all([
    fetch("/data/hierarchy.geojson"),
    fetch("/data/rest-areas.json"),
  ]);
  if (responses.some((r) => !r.ok))
    throw new Error("지도 데이터를 불러오지 못했습니다.");
  [geo, rests] = await Promise.all(responses.map((r) => r.json()));
  records = await loadRecords();
  geo.features.forEach((f) => {
    const target = targetForFeature(f);
    targets.set(target.id, target);
  });
  rests.forEach((r) =>
    targets.set(r.id, {
      ...r,
      sub: `고속도로 ${r.route}번 · ${r.direction}`,
      type: "rest",
    }),
  );
  $("#app").innerHTML = `
  <header><a class="brand" href="" aria-label="둘의 지도 홈"><span class="brand-mark">◒</span><div>둘의 지도<small>OUR LITTLE KOREA</small></div></a><div class="header-copy">함께 다녀온 곳이, 우리의 지도가 돼요.</div><div class="backup-actions"><span class="local-badge">● 이 브라우저에 저장</span><button id="backup">↓ 백업</button><button id="restore">↑ 복원</button><input id="restore-file" type="file" accept="application/json,.json" hidden></div></header>
  <section class="topline"><div><span class="eyebrow">ONE TRIP, ONE PIECE</span><h1>차곡차곡, 우리 여행 조각</h1><p>낯선 도시의 설렘부터 휴게소의 작은 추억까지.</p></div><div class="stats"><div><strong id="region-count">0</strong><span>방문한 지역</span></div><div><strong id="rest-count">0</strong><span>들른 휴게소</span></div><div><strong id="memory-count">0</strong><span>함께 쓴 기록</span></div></div></section>
  <main><aside class="explore"><div class="tabs" role="tablist" aria-label="지도 종류"><button role="tab" id="region-tab" aria-selected="true">전국 여행</button><button role="tab" id="rest-tab" aria-selected="false">휴게소</button></div><div class="explore-intro"><h2 id="explore-title">우리의 다음 여행지는?</h2><p id="explore-copy">지도에서 지역을 선택해 추억을 남겨요.</p></div><label class="search-wrap"><span>⌕</span><input id="search" type="search" placeholder="시·도 검색" aria-label="지역 또는 휴게소 검색"></label><label class="route-filter" hidden>고속도로 노선<select id="route"><option value="">모든 노선</option></select></label><label class="visited-filter"><input id="visited-only" type="checkbox"> 방문한 곳만 보기</label><div class="list-heading"><span id="list-caption">전국 시·도</span><span id="list-count"></span></div><div id="place-list" class="place-list"></div><div class="sidebar-note">사진 한 장이 여행의 한 조각.<br>우리만의 대한민국을 완성해 보세요.</div></aside>
  <section class="map-panel" aria-label="대한민국 여행 지도"><div class="map-top"><div><span class="live-dot"></span><b id="map-title">대한민국 여행 퍼즐</b><span id="map-subtitle">시·도 → 시·군·구</span></div><label><input type="checkbox" id="labels" checked> 지역명</label></div><nav id="map-breadcrumb" aria-label="행정구역 탐색 경로"></nav><svg id="map" viewBox="0 0 900 820" role="img" aria-label="실제 대한민국 행정구역 지도. 마우스 휠로 확대하고 드래그로 이동할 수 있습니다."></svg><div class="map-watermark">OUR<br>LITTLE<br>KOREA<span>함께 채우는 여행 지도</span></div><div class="map-controls"><button id="zoom-in" aria-label="지도 확대">＋</button><button id="zoom-out" aria-label="지도 축소">−</button><button id="reset-map" aria-label="전국 지도 보기">⌂</button></div><div class="map-legend"><span><i class="unvisited"></i>기다리는 여행</span><span><i class="visited"></i>우리의 발자국</span><b id="zoom-level">100%</b></div><div id="map-tooltip" hidden></div></section>
  <aside id="details" class="details" aria-label="여행 기록"></aside></main>
  <footer><span>둘만의 순간을, 지도 위에 오래도록.</span><button id="data-info">지도 데이터·저장 안내 ↗</button></footer>
  <div id="notice" role="status" hidden></div>
  <dialog id="info-dialog"><h2>실제 지도로 만나는 대한민국</h2><p>행정경계: 통계청(KOSTAT) 기반 South Korea Maps의 <b>2018년 경계 기반 시·도 17개 → 최종 시·군·구 229개</b>를 표시합니다. 도의 일반시 안에 나뉜 구는 실제 경계를 합쳐 시로 표시합니다. 사진은 최종 지역에만 등록합니다. 원본을 형태 보존 방식으로 단순화했습니다. 최신 행정구역과 차이가 있을 수 있습니다.</p><p>휴게소: 공개 저장소 rest_area_main의 위치 데이터 <b>210개</b>를 사용합니다. 상·하행은 별도 지점이며, 전국 모든 휴게소 및 최신 개통·폐쇄를 보장하지 않습니다. 임의 생성한 좌표는 없습니다.</p><p>사진과 기록은 이 기기·브라우저의 IndexedDB에 저장됩니다. 서버 업로드나 기기 간 자동 동기화는 없습니다. 브라우저 데이터 삭제·시크릿 모드에서는 소실될 수 있으므로 정기적으로 백업하세요. 사진은 긴 변 1600px JPEG로 저장됩니다.</p><p><a href="https://github.com/southkorea/southkorea-maps" target="_blank" rel="noreferrer">경계 데이터 출처</a> · <a href="https://github.com/kmj381900-debug/rest_area_main" target="_blank" rel="noreferrer">휴게소 데이터 출처</a></p><button class="primary" data-close>확인</button></dialog>
  <dialog id="restore-dialog"><h2>여행 기록을 복원할까요?</h2><p id="restore-summary"></p><p>기존 기록을 유지하며 추가합니다. 같은 ID의 기록은 백업 내용으로 덮어씁니다. 복원 전 현재 기록을 백업해 두세요.</p><div class="dialog-actions"><button data-close>취소</button><button id="confirm-restore" class="primary">복원하기</button></div></dialog>
  <dialog id="photo-dialog"><button data-close aria-label="사진 닫기">✕ 닫기</button><img id="large-photo" alt="여행 사진 크게 보기"></dialog>`;
  bind();
  buildMap();
  fitScope();
  update();
  renderDetails();
}
function bind() {
  $("#region-tab").onclick = () => changeTab("region");
  $("#rest-tab").onclick = () => changeTab("rest");
  $("#search").oninput = (e) => {
    query = e.target.value;
    renderList();
    updateMap();
  };
  $("#visited-only").onchange = (e) => {
    visitedOnly = e.target.checked;
    renderList();
    updateMap();
  };
  [...new Set(rests.map((r) => r.route))]
    .sort((a, b) => +a - +b)
    .forEach((r) => $("#route").add(new Option(`${r}번 고속도로`, r)));
  $("#route").onchange = (e) => {
    route = e.target.value;
    renderList();
    updateMap();
  };
  $("#labels").onchange = updateLabels;
  $("#zoom-in").onclick = () =>
    svg.transition().duration(250).call(zoom.scaleBy, 1.6);
  $("#zoom-out").onclick = () =>
    svg
      .transition()
      .duration(250)
      .call(zoom.scaleBy, 1 / 1.6);
  $("#reset-map").onclick = () =>
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
  $("#data-info").onclick = () => $("#info-dialog").showModal();
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  $("#backup").onclick = async () => {
    try {
      const data = makeBackup(await loadRecords());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `둘의지도-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("사진을 포함한 백업 파일을 내려받았습니다.");
    } catch (e) {
      notify(errorMessage(e), true);
    }
  };
  $("#restore").onclick = () => $("#restore-file").click();
  $("#restore-file").onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 150 * 1024 * 1024)
        throw new Error("백업 파일은 150MB 이하만 복원할 수 있습니다.");
      pendingImport = parseBackup(
        JSON.parse(await f.text()),
        recordTargets(targets),
      );
      $("#restore-summary").textContent =
        `사진 포함 ${pendingImport.length}개의 기록을 확인했습니다.`;
      $("#restore-dialog").showModal();
    } catch (err) {
      notify(errorMessage(err), true);
    } finally {
      e.target.value = "";
    }
  };
  $("#confirm-restore").onclick = async () => {
    if (busy) return;
    if (!canLeave()) return;
    busy = true;
    $("#confirm-restore").disabled = true;
    try {
      await importRecords(pendingImport);
      records = await loadRecords();
      editing = null;
      dirty = false;
      update();
      renderDetails();
      $("#restore-dialog").close();
      notify(`${pendingImport.length}개 기록을 복원했습니다.`);
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      busy = false;
      $("#confirm-restore").disabled = false;
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (dirty || busy) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
function canLeave() {
  return (
    !busy && (!dirty || confirm("저장하지 않은 내용을 버리고 이동할까요?"))
  );
}
function visibleFeatures() {
  return geo.features.filter((f) =>
    tab === "rest" || !currentProvince
      ? f.properties.level === "province"
      : f.properties.level === "municipality" &&
        f.properties.province === currentProvince,
  );
}
function fitScope() {
  if (!projection) return;
  svg.interrupt();
  projection.fitExtent(
    [
      [105, 70],
      [795, 755],
    ],
    { type: "FeatureCollection", features: visibleFeatures() },
  );
  svg.call(zoom.transform, d3.zoomIdentity);
}
function navigateProvince(code) {
  if (!canLeave()) return;
  currentProvince = code;
  selected = null;
  editing = null;
  dirty = false;
  query = "";
  $("#search").value = "";
  $("#map-tooltip").hidden = true;
  fitScope();
  update();
  renderDetails();
}
function renderNavigation() {
  const nav = $("#map-breadcrumb");
  nav.hidden = tab !== "region";
  const province = targets.get("province-" + currentProvince);
  nav.innerHTML = `<button id="national-level" ${currentProvince ? "" : 'aria-current="page"'}>대한민국</button>${province ? `<span>›</span><button aria-current="page">${escape(province.name)}</button><small>시·군·구에서 기록하기</small>` : "<small>시·도를 선택하세요</small>"}`;
  $("#national-level").onclick = () => navigateProvince(null);
  if (tab === "region") {
    $("#list-caption").textContent = currentProvince
      ? "시·군·구 · 마지막 단계"
      : "전국 시·도";
    $("#map-title").textContent = province
      ? province.name + " 여행 퍼즐"
      : "대한민국 여행 퍼즐";
    $("#map-subtitle").textContent = currentProvince
      ? "사진은 이 단계에서 등록해요"
      : "시·도 → 시·군·구";
    $("#search").placeholder = currentProvince ? "시·군·구 검색" : "시·도 검색";
    $("#explore-copy").textContent = currentProvince
      ? "최종 지역을 골라 사진을 등록하세요."
      : "시·도를 누르면 시·군·구가 펼쳐져요.";
  }
}
function changeTab(next) {
  if (tab === next || !canLeave()) return;
  tab = next;
  selected = null;
  editing = null;
  dirty = false;
  query = "";
  route = "";
  $("#search").value = "";
  $("#route").value = "";
  $("#region-tab").setAttribute("aria-selected", String(tab === "region"));
  $("#rest-tab").setAttribute("aria-selected", String(tab === "rest"));
  $("#search").placeholder =
    tab === "region" ? "지역명 또는 시·도 검색" : "휴게소명 또는 노선 검색";
  $(".route-filter").hidden = tab !== "rest";
  $("#explore-title").textContent =
    tab === "region" ? "우리의 다음 여행지는?" : "잠깐의 쉼도, 여행이니까";
  $("#explore-copy").textContent =
    tab === "region"
      ? "지도에서 지역을 선택해 추억을 남겨요."
      : "상·하행 휴게소에 작은 추억을 남겨요.";
  $("#list-caption").textContent =
    tab === "region" ? "전국 시·군·구" : "데이터에 포함된 휴게소";
  $("#map-title").textContent =
    tab === "region" ? "대한민국 여행 퍼즐" : "우리의 고속도로 쉼표";
  $("#map-subtitle").textContent =
    tab === "region" ? "2018 시·군·구 경계" : "실제 좌표 · 210개 지점";
  fitScope();
  update();
  renderDetails();
}
function matches(t) {
  return (
    t.type === tab &&
    (tab !== "region" ||
      (currentProvince
        ? t.level === "municipality" && t.province === currentProvince
        : t.level === "province")) &&
    (!visitedOnly || listRecords(t.id).length > 0) &&
    (!route || t.type !== "rest" || t.route === route) &&
    `${t.name} ${t.sub}`.replace(/\s/g, "").includes(query.replace(/\s/g, ""))
  );
}
function update() {
  $("#region-count").textContent = [...targets.values()].filter(
    (t) => t.level === "municipality" && listRecords(t.id).length,
  ).length;
  $("#rest-count").textContent = rests.filter(
    (r) => listRecords(r.id).length,
  ).length;
  $("#memory-count").textContent = records.length;
  renderNavigation();
  renderList();
  updateMap();
}
function renderList() {
  const places = [...targets.values()].filter(matches);
  $("#list-count").textContent = `${places.length}곳`;
  $("#place-list").innerHTML = places.length
    ? places
        .map((t) => {
          const rs = listRecords(t.id);
          return `<button class="place ${selected === t.id ? "active" : ""}" data-place="${t.id}"><span class="place-icon ${rs.length ? "done" : ""}">${rs.length ? "♥" : tab === "region" ? "◇" : "☕"}</span><span><b>${escape(t.name)}</b><small>${escape(t.sub)}</small></span>${rs.length ? `<span class="count-pill">${rs.length}</span>` : '<span class="place-arrow">›</span>'}</button>`;
        })
        .join("")
    : '<p class="no-results">검색 결과가 없어요.<br>다른 이름으로 찾아보세요.</p>';
  document
    .querySelectorAll("[data-place]")
    .forEach((b) => (b.onclick = () => selectPlace(b.dataset.place, true)));
}
function selectPlace(id, focus = false) {
  if (!canLeave()) return;
  const target = targets.get(id);
  if (target.level === "province") {
    navigateProvince(target.province);
    return;
  }
  selected = id;
  editing = null;
  dirty = false;
  renderList();
  updateMap();
  renderDetails();
  if (focus) {
    const t = targets.get(id);
    let k, x, y;
    if (t.feature) {
      const b = path.bounds(t.feature);
      k = Math.min(
        9,
        Math.max(
          1.4,
          0.65 / Math.max((b[1][0] - b[0][0]) / 900, (b[1][1] - b[0][1]) / 820),
        ),
      );
      x = (b[0][0] + b[1][0]) / 2;
      y = (b[0][1] + b[1][1]) / 2;
    } else {
      [x, y] = projection([t.lng, t.lat]);
      k = 5;
    }
    svg
      .transition()
      .duration(500)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(450 - k * x, 410 - k * y).scale(k),
      );
  }
}
function buildMap() {
  svg = d3.select("#map");
  projection = d3.geoMercator().fitExtent(
    [
      [105, 35],
      [795, 775],
    ],
    geo,
  );
  path = d3.geoPath(projection);
  svg.append("defs");
  g = svg.append("g");
  g.append("g").attr("class", "regions");
  markerLayer = g.append("g").attr("class", "markers");
  labelLayer = g.append("g").attr("class", "labels");
  zoom = d3
    .zoom()
    .scaleExtent([1, 16])
    .translateExtent([
      [-150, -150],
      [1050, 970],
    ])
    .on("zoom", (e) => {
      transform = e.transform;
      g.attr("transform", transform);
      $("#zoom-level").textContent = `${Math.round(transform.k * 100)}%`;
      updateLabels();
      markerLayer
        .selectAll("circle")
        .attr("r", 6 / transform.k)
        .attr("stroke-width", 1.5 / transform.k);
    });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click.clear", (e) => {
    if (e.target === svg.node()) $("#map-tooltip").hidden = true;
  });
}
function showTooltip(e, t) {
  if (t.type !== tab) return;
  const tip = $("#map-tooltip");
  tip.textContent = `${t.sub} ${t.name} · 기록 ${listRecords(t.id).length}개`;
  const b = $(".map-panel").getBoundingClientRect();
  tip.style.left = `${Math.min(e.clientX - b.left + 12, b.width - 220)}px`;
  tip.style.top = `${e.clientY - b.top - 35}px`;
  tip.hidden = false;
}
function updateMap() {
  const features = visibleFeatures();
  regionPaths = g
    .select(".regions")
    .selectAll("path")
    .data(features, (f) => f.id)
    .join("path")
    .attr("d", path)
    .attr("data-region", (f) => f.id)
    .on("click", (e, f) => {
      if (tab === "region") selectPlace(f.id);
    })
    .on("mousemove", (e, f) => showTooltip(e, targets.get(f.id)))
    .on("mouseleave", () => ($("#map-tooltip").hidden = true));
  const defs = svg.select("defs");
  defs.selectAll("*").remove();
  features.forEach((f) => {
    const photo =
      f.properties.level === "municipality"
        ? listRecords(f.id).find((r) => r.photos.length)?.photos[0]
        : null;
    if (photo) {
      const b = path.bounds(f);
      const p = defs
        .append("pattern")
        .attr("id", "photo-" + f.properties.code)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("viewBox", `0 0 ${b[1][0] - b[0][0]} ${b[1][1] - b[0][1]}`)
        .attr("x", b[0][0])
        .attr("y", b[0][1])
        .attr("width", b[1][0] - b[0][0])
        .attr("height", b[1][1] - b[0][1]);
      p.append("image")
        .attr("href", photo)
        .attr("width", b[1][0] - b[0][0])
        .attr("height", b[1][1] - b[0][1])
        .attr("preserveAspectRatio", "xMidYMid slice");
    }
  });
  regionPaths
    .attr("fill", (f) => {
      const rs = listRecords(f.id);
      return f.properties.level === "municipality" &&
        rs.some((r) => r.photos.length)
        ? `url(#photo-${f.properties.code})`
        : rs.length
          ? "#aec1a0"
          : null;
    })
    .classed("selected", (f) => selected === f.id)
    .classed("muted", (f) => tab === "rest" || !matches(targets.get(f.id)));
  markerLayer
    .selectAll("circle")
    .data(
      tab === "rest" ? rests.filter((r) => matches(targets.get(r.id))) : [],
      (r) => r.id,
    )
    .join("circle")
    .attr("cx", (r) => projection([r.lng, r.lat])[0])
    .attr("cy", (r) => projection([r.lng, r.lat])[1])
    .attr("r", 6 / transform.k)
    .attr("stroke-width", 1.5 / transform.k)
    .attr("fill", (r) => (listRecords(r.id).length ? "#c67764" : "#657c59"))
    .classed("selected", (r) => selected === r.id)
    .on("click", (e, r) => {
      e.stopPropagation();
      selectPlace(r.id);
    })
    .on("mousemove", (e, r) => showTooltip(e, targets.get(r.id)))
    .on("mouseleave", () => ($("#map-tooltip").hidden = true));
  updateLabels();
}
function updateLabels() {
  if (!labelLayer) return;
  labelLayer.selectAll("*").remove();
  if (!$("#labels").checked) return;
  const candidates = [...targets.values()]
    .filter(matches)
    .map((t) => ({
      t,
      p: t.feature ? path.centroid(t.feature) : projection([t.lng, t.lat]),
    }))
    .sort(
      (a, b) =>
        (b.t.id === selected) - (a.t.id === selected) ||
        listRecords(b.t.id).length - listRecords(a.t.id).length,
    );
  const boxes = [];
  for (const { t, p } of candidates) {
    const [x, y] = transform.apply(p);
    if (x < 18 || x > 882 || y < 15 || y > 805) continue;
    const w = t.name.length * 10 + 8,
      h = 18,
      box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    if (
      boxes.some(
        (b) =>
          box[0] < b[2] + 7 &&
          box[2] > b[0] - 7 &&
          box[1] < b[3] + 7 &&
          box[3] > b[1] - 7,
      )
    )
      continue;
    if (t.feature && transform.k < 2.2) {
      const b = path.bounds(t.feature);
      if ((b[1][0] - b[0][0]) * transform.k < w * 0.65) continue;
    }
    if (t.type === "rest" && transform.k < 2.5 && t.id !== selected) continue;
    boxes.push(box);
    labelLayer
      .append("text")
      .attr("x", p[0])
      .attr("y", p[1] + (t.type === "rest" ? -10 : 3) / transform.k)
      .attr("font-size", 10 / transform.k)
      .attr("stroke-width", 3 / transform.k)
      .text(t.name);
  }
}
function renderDetails() {
  const el = $("#details");
  if (!selected) {
    const terminalPlaces = [...targets.values()].filter((t) =>
      tab === "rest"
        ? t.type === "rest"
        : t.level === "municipality" &&
          (!currentProvince || t.province === currentProvince),
    );
    const count = terminalPlaces.filter((t) => listRecords(t.id).length).length,
      total = terminalPlaces.length;
    el.innerHTML = `<div class="detail-empty"><span class="eyebrow">OUR TRAVEL JOURNAL</span><div class="empty-art">⌖<span>♥</span></div><h2>어디서 함께 웃었나요?</h2><p>${tab === "region" ? (currentProvince ? "시·군·구를 선택하면<br>사진과 메모를 남길 수 있어요." : "먼저 시·도를 선택하고<br>시·군·구에 추억을 남겨 보세요.") : "휴게소를 선택해 추억을 남겨 보세요."}</p><div class="progress-card"><div><b>우리의 여행 조각</b><span>${count} / ${total}</span></div><div class="progress-track"><i style="width:${(count / total) * 100}%"></i></div><small>${((count / total) * 100).toFixed(1)}%의 추억을 채웠어요</small></div><div class="tip"><b>이렇게 기록해 보세요</b><p>01 &nbsp; 시·도를 선택하고<br>02 &nbsp; 시·군·구에서 사진을 남기면<br>03 &nbsp; 그 조각이 추억으로 채워져요</p></div></div>`;
    return;
  }
  const t = targets.get(selected),
    rs = listRecords(selected);
  el.innerHTML = `<div class="detail-heading"><span class="eyebrow">${escape(t.sub)}</span><h2>${escape(t.name)}<span>${rs.length ? "♥" : "♡"}</span></h2><p>${rs.length ? `${rs.length}번의 함께한 순간` : "아직 비어 있는 우리의 여행 조각"}</p><button id="new-record" class="primary">＋ 새로운 추억 남기기</button></div><div id="editor"></div><div id="record-list">${rs.length ? rs.map((r) => `<article class="memory" data-record="${escape(r.id)}"><div class="memory-meta"><time>${escape(r.date.replaceAll("-", "."))}</time><span><button data-edit="${escape(r.id)}">수정</button><button data-delete="${escape(r.id)}">삭제</button></span></div><h3>${escape(r.title || "함께한 하루")}</h3>${r.photos.length ? `<div class="memory-photos">${r.photos.map((p, i) => `<button data-photo-record="${escape(r.id)}" data-photo-index="${i}" aria-label="여행 사진 ${i + 1} 크게 보기"><img src="${p}" alt="${escape(t.name)} 여행 사진 ${i + 1}" loading="lazy"></button>`).join("")}</div>` : ""}<p class="memo">${escape(r.memo)}</p></article>`).join("") : '<div class="no-memory">첫 번째 기록을 기다리고 있어요.<br>사진 없이 메모만 남겨도 좋아요.</div>'}</div>`;
  $("#new-record").onclick = () => {
    if (canLeave()) openEditor();
  };
  el.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = () => {
        if (canLeave())
          openEditor(records.find((r) => r.id === b.dataset.edit));
      }),
  );
  el.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (
          !canLeave() ||
          !confirm("이 기록과 사진을 삭제할까요? 삭제 전 백업을 권장합니다.")
        )
          return;
        try {
          await deleteRecord(b.dataset.delete);
          records = await loadRecords();
          editing = null;
          dirty = false;
          update();
          renderDetails();
          notify("기록을 삭제했습니다.");
        } catch (e) {
          notify(errorMessage(e), true);
        }
      }),
  );
  el.querySelectorAll("[data-photo-record]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#large-photo").src = records.find(
          (r) => r.id === b.dataset.photoRecord,
        ).photos[+b.dataset.photoIndex];
        $("#photo-dialog").showModal();
      }),
  );
}
function formStatus(message, error = false) {
  const el = $("#form-status");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("error", error);
}
function setEditorBusy(active, label = "추억 저장하기") {
  const form = $("#record-form");
  if (!form) return;
  form.setAttribute("aria-busy", String(active));
  form
    .querySelectorAll("input,textarea,button")
    .forEach((el) => (el.disabled = active));
  $("#save-record").textContent = label;
}
const nextFrame = () =>
  new Promise((resolve) => setTimeout(resolve, 0));
function openEditor(r) {
  const t = targets.get(selected);
  if (!t || (t.type === "region" && t.level !== "municipality")) return;
  editing = r?.id || crypto.randomUUID();
  photos = [...(r?.photos || [])];
  dirty = false;
  $("#editor").innerHTML =
    `<form id="record-form" novalidate><div class="form-top"><b>${r ? "추억 수정하기" : "새로운 여행 기록"}</b><button type="button" id="cancel-editor" aria-label="기록 작성 취소">✕</button></div><label>방문 날짜<input name="date" type="date" required value="${escape(r?.date || today())}"></label><label>한 줄 제목<input name="title" maxlength="100" placeholder="우리의 어떤 하루였나요?" value="${escape(r?.title || "")}"></label><label>여행 메모<textarea name="memo" rows="4" maxlength="5000" placeholder="함께 본 풍경, 맛있었던 음식, 기억하고 싶은 마음…">${escape(r?.memo || "")}</textarea></label><label class="photo-upload">＋ 사진 추가 <span>최대 6장 · 장당 12MB</span><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div id="photo-previews"></div><p class="form-hint">사진은 긴 변 1600px로 줄여 이 브라우저에만 저장해요.</p><p id="form-status" class="form-status" role="status" aria-live="polite" hidden></p><button class="primary" id="save-record" type="submit">추억 저장하기</button></form>`;
  $("#cancel-editor").onclick = () => {
    if (canLeave()) {
      editing = null;
      dirty = false;
      $("#editor").innerHTML = "";
    }
  };
  $("#record-form").oninput = () => (dirty = true);
  $("#photos").onchange = async (e) => {
    if (busy) return;
    const input = e.target,
      files = [...input.files];
    if (!files.length) return;
    busy = true;
    setEditorBusy(true, "사진 처리 중…");
    try {
      if (photos.length + files.length > MAX_PHOTOS)
        throw new Error("사진은 기록당 최대 6장까지 등록할 수 있습니다.");
      const prepared = [];
      for (let i = 0; i < files.length; i++) {
        formStatus(
          `사진을 준비하고 있어요 (${i + 1}/${files.length}). 완료되면 저장할 수 있어요.`,
        );
        await nextFrame();
        prepared.push(await preparePhoto(files[i]));
      }
      photos.push(...prepared);
      dirty = true;
      renderPreviews();
      formStatus(
        `사진 ${photos.length}장이 준비됐어요. ‘추억 저장하기’를 눌러 주세요.`,
      );
    } catch (error) {
      const message = errorMessage(error);
      formStatus(message, true);
      notify(message, true);
    } finally {
      busy = false;
      setEditorBusy(false);
      input.value = "";
    }
  };
  $("#record-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    formStatus("사진과 기록을 저장하고 있어요…");
    try {
      const form = new FormData(e.currentTarget);
      const record = validateRecord(
        {
          id: editing,
          target: selected,
          date: form.get("date"),
          title: form.get("title").trim(),
          memo: form.get("memo").trim(),
          photos,
        },
        recordTargets(targets),
      );
      if (!record.title && !record.memo && !record.photos.length)
        throw new Error("사진, 제목, 메모 중 하나를 남겨 주세요.");
      setEditorBusy(true, "저장 중…");
      await nextFrame();
      await saveRecord(record);
      records = [...records.filter((r) => r.id !== record.id), record];
      dirty = false;
      editing = null;
      update();
      renderDetails();
      notify("우리의 추억 한 조각을 저장했어요.");
    } catch (err) {
      const message = errorMessage(err);
      formStatus(message, true);
      notify(message, true);
    } finally {
      busy = false;
      setEditorBusy(false);
    }
  };
  renderPreviews();
  $("#record-form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function renderPreviews() {
  $("#photo-previews").innerHTML = photos
    .map(
      (p, i) =>
        `<div><img src="${p}" alt="등록할 사진 ${i + 1}"><button type="button" data-remove="${i}" aria-label="등록할 사진 ${i + 1} 삭제">✕</button></div>`,
    )
    .join("");
  document.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        if (busy) return;
        photos.splice(+b.dataset.remove, 1);
        dirty = true;
        renderPreviews();
      }),
  );
}
start().catch((e) => {
  $("#app").innerHTML =
    `<div class="boot"><h1>지도를 열지 못했어요</h1><p>${escape(errorMessage(e))}</p><p>브라우저의 사이트 저장소 사용을 허용하고 다시 시도해 주세요.</p><button onclick="location.reload()">다시 시도</button></div>`;
});
