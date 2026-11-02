// lets --cpu-prof flush on SIGINT
process.on("SIGINT", () => process.exit(0));
