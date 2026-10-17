import { openDB } from "idb";
let connection;
function database() {
  if (!connection) {
    connection = openDB("our-korea-map", 1, {
      upgrade(db) {
        db.createObjectStore("records", { keyPath: "id" });
      },
      terminated() {
        connection = undefined;
      },
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}
// Abort pending writes rather than leaving the form locked indefinitely.
export async function writeRecords(db, records, timeoutMs = 12000) {
  const tx = db.transaction("records", "readwrite");
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      let aborted = false;
      try {
        tx.abort();
        aborted = true;
      } catch {
        /* already finished */
      }
      reject(
        new Error(
          aborted
            ? "저장이 지연되어 취소했습니다. 작성한 내용과 사진은 그대로 있으니 다시 저장해 주세요."
            : "저장 완료 여부를 확인하지 못했습니다. 작성 내용은 그대로 있습니다. 잠시 후 다시 저장해 주세요.",
        ),
      );
    }, timeoutMs);
  });
  // Attach rejection handlers immediately, including synchronous put failures.
  const finished = (async () => {
    const done = tx.done;
    done.catch(() => {});
    try {
      await Promise.all(records.map((record) => tx.store.put(record)));
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* already aborted/finished */
      }
      throw error;
    }
  })();
  try {
    await Promise.race([finished, expired]);
  } finally {
    clearTimeout(timer);
  }
}
export async function loadRecords() {
  return (await database()).getAll("records");
}
export async function saveRecord(record) {
  await writeRecords(await database(), [record]);
}
export async function deleteRecord(id) {
  return (await database()).delete("records", id);
}
export async function importRecords(records) {
  await writeRecords(await database(), records, 30000);
}
