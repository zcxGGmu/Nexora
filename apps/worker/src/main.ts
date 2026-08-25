import { EnvironmentValidationError, parseEnvironment } from "@nexora/config";

async function runWorker(): Promise<void> {
  const environment = parseEnvironment(process.env);
  console.log(
    JSON.stringify({
      event: "worker_idle",
      service: "worker",
      status: "ready",
      data_dir: environment.dataDir,
      queue: "not_configured",
    }),
  );

  await new Promise<void>((resolve) => {
    const idleHandle = setInterval(() => undefined, 60_000);
    const stop = (): void => {
      clearInterval(idleHandle);
      resolve();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

try {
  await runWorker();
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    console.error(error.message);
  } else {
    console.error("Nexora worker failed to start");
  }
  process.exitCode = 1;
}
