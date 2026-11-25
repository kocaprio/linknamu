import { MongoClient } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

function getClient(uri: string) {
  clientPromise ??= new MongoClient(uri, { serverSelectionTimeoutMS: 3000 })
    .connect()
    .catch((error) => {
      clientPromise = null; // 다음 요청에서 다시 연결 시도
      throw error;
    });
  return clientPromise;
}

/** 링크별 클릭 수를 1 올립니다. MONGODB_URI 가 없으면 기록하지 않습니다. */
export async function recordClick(linkId: string) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI 가 없어 클릭 수를 기록하지 않았습니다.");
    return;
  }

  const client = await getClient(uri);
  await client
    .db(process.env.MONGODB_DB || "linknamu")
    .collection<{ _id: string; count: number; lastClickedAt: Date }>("clicks")
    .updateOne(
      { _id: linkId },
      { $inc: { count: 1 }, $set: { lastClickedAt: new Date() } },
      { upsert: true },
    );
}
