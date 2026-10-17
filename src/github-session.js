import { GitHubAPI, GitHubStore, repositoryName } from "./github.js";
import * as local from "./storage.js";
const KEY = "our-korea-github-settings-v1";
let store;
export function githubSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
export const githubMode = () => githubSettings().enabled === true;
export const githubConnected = () => !!store?.api.token;
function requireGitHub() {
  if (!githubConnected())
    throw Error(
      "GitHub 연결에서 저장소 전용 토큰을 다시 입력해 주세요. 브라우저 저장으로 자동 전환하지 않습니다.",
    );
  return store;
}
export async function connectGitHub(
  { token, repository, branch, allowPublic },
  targets,
) {
  if (!token.trim() || /\s/.test(token.trim()))
    throw Error("저장소 전용 GitHub 토큰을 입력해 주세요.");
  if (!window.isSecureContext || location.protocol === "file:")
    throw Error(
      "GitHub 연결은 게시한 HTTPS 사이트 또는 localhost 개발 주소에서 사용해 주세요.",
    );
  const api = new GitHubAPI(token.trim(), repositoryName(repository), branch);
  const repo = await api.check();
  if (!repo.private && !allowPublic)
    throw Error(
      "공개 저장소입니다. 사진과 메모도 누구나 볼 수 있어요. 공개 동의를 체크하거나 비공개 저장소를 연결해 주세요.",
    );
  const candidate = new GitHubStore(api, "travel-data", targets);
  const records = await candidate.load();
  localStorage.setItem(
    KEY,
    JSON.stringify({
      repository: api.repository,
      branch: api.branch,
      private: repo.private,
      enabled: true,
    }),
  );
  store = candidate;
  return records;
}
export function disconnectGitHub() {
  store = undefined;
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...githubSettings(), enabled: false }),
  );
}
export async function loadRecords() {
  return githubMode() ? requireGitHub().load() : local.loadRecords();
}
export async function saveRecord(record) {
  return githubMode()
    ? requireGitHub().append(record.id, record)
    : local.saveRecord(record);
}
export async function deleteRecord(id) {
  return githubMode()
    ? requireGitHub().append(id, null)
    : local.deleteRecord(id);
}
export async function importRecords(records) {
  if (!githubMode()) return local.importRecords(records);
  const remote = requireGitHub();
  for (const r of records) await remote.append(r.id, r);
}
export async function uploadLocalRecords() {
  const remote = requireGitHub();
  const records = await local.loadRecords();
  let added = 0,
    skipped = 0;
  for (const r of records) {
    if (remote.refs.has(r.id)) {
      skipped++;
      continue;
    }
    await remote.append(r.id, r);
    added++;
  }
  return { added, skipped };
}
