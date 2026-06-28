// The broad-topic classifier now lives in @flowpedia/shared so the mobile app
// can run the exact same logic as a fallback (classifying library articles that
// were cached before the `topics` field existed). Re-exported here to keep the
// existing import paths (wikipedia.service, topics.spec) unchanged.
export { TOPIC_IDS, classifyTopics, type TopicId } from "@flowpedia/shared";
