async function main() {
  process.env.TEST_JESS_KATE = "1";
  await import("./check-lynq-management");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
