import { ingestTestFixture } from "../services/testFixtureIngestion";

function readArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error("Missing required " + name + " argument");
  return value;
}

async function main() {
  const result = await ingestTestFixture({
    fixturePath: readArgument("--fixture"),
    investigationId: readArgument("--investigation-id"),
    actorId: readArgument("--actor-id"),
    authorizationId: readArgument("--authorization-id"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
