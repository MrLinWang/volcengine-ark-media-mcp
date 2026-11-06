function line(level: string, message: string): string {
  return `[${new Date().toISOString()}] [${level}] ${message}`;
}

export const log = {
  debug(message: string): void {
    if (process.env.ARK_DEBUG === "1") {
      console.error(line("debug", message));
    }
  },
  info(message: string): void {
    console.error(line("info", message));
  },
  warn(message: string): void {
    console.error(line("warn", message));
  },
  error(message: string): void {
    console.error(line("error", message));
  },
};
