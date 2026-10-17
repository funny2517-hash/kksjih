import { validateRecord, MAX_PHOTOS } from "./records.js";
const API = "https://api.github.com";
const FILE_ID =
  /^(records\/[a-f0-9-]{36}\.json|photos\/[a-f0-9]{64}\.(jpg|png|webp))$/;
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
export function repositoryName(value) {
  const text = value
    .trim()
    .replace(/^https:\/\/github.com\//, "")
    .replace(/\/$/, "")
    .replace(/\.git$/, "");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text) ||
    text.split("/").some((p) => p === "." || p === "..")
  )
    throw Error("저장소를 소유자/저장소 형식으로 입력해 주세요.");
  return text;
}
export function revisionHeads(events) {
  const byId = new Map(events.map((e) => [e.fileId, e]));
  const parents = new Set(
    events
      .filter((e) => byId.get(e.parent)?.recordId === e.recordId)
      .map((e) => e.parent),
  );
  return events
    .filter((e) => !parents.has(e.fileId) && !e.deleted)
    .sort((a, b) => a.fileId.localeCompare(b.fileId));
}
async function gitHash(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const joined = new Uint8Array(prefix.length + bytes.length);
  joined.set(prefix);
  joined.set(bytes, prefix.length);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", joined))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export class GitHubAPI {
  constructor(token, repository, branch = "main") {
    this.token = token;
    this.repository = repositoryName(repository);
    this.branch = branch.trim();
    if (
      !this.branch ||
      this.branch.length > 200 ||
      /[\x00-\x20~^:?*\[\\]/.test(this.branch) ||
      this.branch.includes("..")
    )
      throw Error("브랜치 이름을 확인해 주세요.");
    this.root = "/repos/" + this.repository;
  }
  async request(path, options = {}) {
    if (!this.token)
      throw Error(
        "GitHub 연결이 만료됐어요. 저장소 연결에서 토큰을 다시 입력해 주세요.",
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(API + this.root + path, {
        ...options,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...options.headers,
          Authorization: `Bearer ${this.token}`,
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const messages = {
          401: "GitHub 토큰이 만료됐거나 올바르지 않아요. 다시 연결해 주세요.",
          403: "GitHub 권한 또는 API 제한을 확인해 주세요. 선택한 저장소의 Contents 읽기·쓰기 권한이 필요합니다.",
          404: "저장소·브랜치·사진을 찾지 못했어요. 이름과 비공개 저장소 접근 권한을 확인해 주세요.",
          409: "다른 저장 작업과 겹쳤어요. 잠시 후 다시 시도해 주세요.",
          422: "GitHub가 저장을 거부했어요. 브랜치 보호 규칙과 파일을 확인해 주세요.",
        };
        if (res.status === 401) this.token = "";
        const e = Error(
          messages[res.status] ||
            `GitHub 요청 실패 (${res.status}). 잠시 후 다시 시도해 주세요.`,
        );
        e.status = res.status;
        throw e;
      }
      const reader = res.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 6000000) {
            await reader.cancel();
            throw Error("허용 크기를 초과한 GitHub 파일입니다.");
          }
          chunks.push(value);
        }
      return new Response(new Blob(chunks), {
        status: res.status,
        headers: res.headers,
      });
    } catch (e) {
      if (e.name === "AbortError")
        throw Error(
          "GitHub 응답이 지연됐어요. 새로고침으로 저장 여부를 확인해 주세요. 작성 내용은 유지됩니다.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  async json(path, options) {
    return (await this.request(path, options)).json();
  }
  async check() {
    const repo = await this.json("");
    if (repo.archived || repo.permissions?.push === false)
      throw Error(
        "이 저장소에 업로드할 수 없어요. 쓰기 권한과 보관 상태를 확인해 주세요.",
      );
    await this.json("/branches/" + encodeURIComponent(this.branch));
    return { private: repo.private, name: repo.full_name };
  }
  async list() {
    const root = await this.json(
      "/git/trees/" + encodeURIComponent(this.branch),
    );
    const data = root.tree.find(
      (t) => t.path === "travel-data" && t.type === "tree",
    );
    if (!data) return [];
    const tree = await this.json("/git/trees/" + data.sha + "?recursive=1");
    if (tree.truncated)
      throw Error(
        "저장소의 사진 이력이 너무 많아 전체 목록을 읽지 못했어요. 백업 후 새 저장소를 연결해 주세요.",
      );
    return tree.tree
      .filter(
        (f) =>
          f.type === "blob" &&
          f.path.startsWith("records/") &&
          FILE_ID.test(f.path),
      )
      .map((f) => ({ id: f.path }));
  }
  async read(id, maxBytes) {
    if (!FILE_ID.test(id)) throw Error("여행 파일 경로가 올바르지 않습니다.");
    const res = await this.request(
      "/contents/travel-data/" +
        encodePath(id) +
        "?ref=" +
        encodeURIComponent(this.branch),
      { headers: { Accept: "application/vnd.github.raw+json" } },
    );
    const blob = await res.blob();
    if (blob.size > maxBytes)
      throw Error("허용 크기를 초과한 여행 파일입니다.");
    return blob;
  }
  async upload(metadata, blob) {
    const image = blob.type.startsWith("image/");
    const id = image
      ? `photos/${await digest(blob)}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`
      : `records/${crypto.randomUUID()}.json`;
    const path = "/contents/travel-data/" + encodePath(id);
    const expected = await gitHash(blob);
    const content = await base64(blob);
    // Parallel clients may change HEAD between requests. Retry the same immutable path.
    // If a response was lost, a matching Git blob SHA proves the upload already succeeded.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await this.json(path, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: image ? "여행 사진 업로드" : "여행 기록 저장",
            branch: this.branch,
            content,
          }),
        });
        return { id };
      } catch (e) {
        if (e.status && ![409, 422].includes(e.status) && e.status < 500)
          throw e;
        try {
          const existing = await this.json(
            path + "?ref=" + encodeURIComponent(this.branch),
          );
          if (existing.sha === expected) return { id };
          throw Error("같은 경로에 다른 파일이 있어 저장을 중단했어요.");
        } catch (check) {
          if (check.status !== 404) throw check;
        }
        if (attempt === 3) throw e;
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1)),
        );
      }
    }
  }
}
async function mapLimit(values, fn) {
  const out = new Array(values.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (index < values.length) {
        const i = index++;
        out[i] = await fn(values[i], i);
      }
    }),
  );
  return out;
}
async function digest(blob) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function dataURL(blob, mime) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("사진을 읽지 못했습니다."));
    r.readAsDataURL(new Blob([blob], { type: mime }));
  });
}
function validEvent(e, fileId) {
  if (
    e?.format !== "couple-map-github" ||
    e.version !== 1 ||
    typeof e.recordId !== "string" ||
    !e.recordId ||
    e.recordId.length > 100 ||
    (e.parent !== null && !FILE_ID.test(e.parent)) ||
    typeof e.deleted !== "boolean"
  )
    throw Error("GitHub 기록 형식이 올바르지 않습니다.");
  return { ...e, fileId };
}
export class GitHubStore {
  constructor(api, folder, targets) {
    this.api = api;
    this.folder = folder;
    this.targets = targets;
    this.events = new Map();
    this.refs = new Map();
    this.photoRefs = new Map();
    this.photos = new Map();
    this.records = [];
  }
  async load() {
    const files = await this.api.list(this.folder);
    const events = await mapLimit(files, async (f) => {
      if (this.events.has(f.id)) return this.events.get(f.id);
      return validEvent(
        JSON.parse(await (await this.api.read(f.id, 100000)).text()),
        f.id,
      );
    });
    const heads = revisionHeads(events);
    const refs = new Map();
    const seen = new Set();
    const records = await mapLimit(heads, async (e) => {
      const first = !seen.has(e.recordId);
      seen.add(e.recordId);
      const id = first ? e.recordId : `conflict-${e.fileId}`;
      const photos = e.record?.photos;
      if (!Array.isArray(photos) || photos.length > MAX_PHOTOS)
        throw Error("GitHub 사진 목록이 올바르지 않습니다.");
      const hydrated = await mapLimit(photos, async (p) => {
        if (
          !FILE_ID.test(p.id) ||
          !/^image\/(jpeg|png|webp)$/.test(p.mime) ||
          !/^[a-f0-9]{64}$/.test(p.sha256)
        )
          throw Error("GitHub 사진 정보가 올바르지 않습니다.");
        if (!this.photos.has(p.id)) {
          const blob = await this.api.read(p.id, 5999999);
          if ((await digest(blob)) !== p.sha256)
            throw Error(
              "GitHub 사진 무결성 확인에 실패했습니다. 원본 파일이 바뀌었는지 확인해 주세요.",
            );
          this.photos.set(p.id, await dataURL(blob, p.mime));
        }
        this.photoRefs.set(p.sha256, p);
        return this.photos.get(p.id);
      });
      const r = validateRecord(
        { ...e.record, id, photos: hydrated },
        this.targets,
      );
      if (!first) r.title = ("[동시 수정본] " + r.title).slice(0, 100);
      refs.set(id, { recordId: e.recordId, parent: e.fileId });
      return r;
    });
    this.events = new Map(events.map((e) => [e.fileId, e]));
    this.refs = refs;
    this.records = records;
    return records;
  }
  async append(id, record) {
    const ref = this.refs.get(id) || { recordId: id, parent: null };
    const event = {
      format: "couple-map-github",
      version: 1,
      ...ref,
      deleted: record === null,
    };
    if (record) {
      const valid = validateRecord(record, this.targets);
      const photos = await mapLimit(valid.photos, async (url) => {
        const blob = await (await fetch(url)).blob();
        const sha256 = await digest(blob);
        if (this.photoRefs.has(sha256)) return this.photoRefs.get(sha256);
        const file = await this.api.upload(
          {
            name: `여행사진-${crypto.randomUUID()}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`,
          },
          blob,
        );
        const p = { id: file.id, mime: blob.type, sha256 };
        this.photoRefs.set(sha256, p);
        this.photos.set(p.id, url);
        return p;
      });
      event.record = { ...valid, id: ref.recordId, photos };
    }
    // Upload photos first, then publish a new immutable revision. Never overwrite a shared manifest.
    const file = await this.api.upload(
      {
        name: `추억-${crypto.randomUUID()}.json`,
      },
      new Blob([JSON.stringify(event)], { type: "application/json" }),
    );
    this.events.set(file.id, { ...event, fileId: file.id });
    this.refs.set(id, { recordId: ref.recordId, parent: file.id });
  }
}
