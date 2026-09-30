"use strict";
// Resolve the request's data source when a query is awaited, preserving the SDK's
// native query builder and storage URL generation. Nothing is selected globally.
function deferredClient(resolveClient) {
  function build(steps) {
    const execute = async () => {
      let value = await resolveClient(), receiver;
      for (const step of steps) {
        if (step.kind === "get") { receiver = value; value = Reflect.get(value, step.key); }
        else { value = Reflect.apply(value, receiver, step.args); receiver = undefined; }
      }
      return value;
    };
    return new Proxy(function () {}, {
      get(_target, key) {
        if (key === "then") return (yes, no) => execute().then(yes, no);
        if (key === "catch") return no => execute().catch(no);
        if (key === "finally") return done => execute().finally(done);
        return build([...steps, {kind: "get", key}]);
      },
      apply(_target, _receiver, args) { return build([...steps, {kind: "call", args}]); },
    });
  }
  return build([]);
}
module.exports = { deferredClient };
