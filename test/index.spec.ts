import { noop } from "@unwanted/common";

import {
  props,
  defer,
  delay,
  timeout,
  nodeify,
  promisify,
  try as _try,
  callbackify,
  promisifyAll,
  finally as _finally,
} from "../src";

describe("defer", () => {
  it("should have a promise", () => {
    const d = defer();
    expect(d.promise).toBeInstanceOf(Promise);
  });

  it("should have a resolve function", () => {
    const d = defer();
    expect(d.resolve).toBeInstanceOf(Function);
  });

  it("should have a reject function", () => {
    const d = defer();
    expect(d.reject).toBeInstanceOf(Function);
  });

  it("should resolve the promise", async () => {
    const d = defer();
    d.resolve(5);
    expect(await d.promise).toEqual(5);
  });

  it("should reject the promise", async () => {
    const d = defer();
    d.reject(10);
    expect(
      await d.promise.then(
        () => null,
        (x) => x
      )
    ).toEqual(10);
  });
});

describe("delay", () => {
  it("should be a promise", () => {
    expect(delay(100)).toBeInstanceOf(Promise);
  });

  it("should be delayed", async () => {
    const past = new Date();
    await delay(100);
    expect(new Date() - past).toBeGreaterThan(95);
  });

  it("should be resolves with a value", async () => {
    expect(await delay(50, 10)).toEqual(10);
  });
});

describe("timeout", () => {
  it("should throw if the first argument is not a promise", () => {
    expect(() => {
      timeout(5);
    }).toThrow(new TypeError("The first argument must be a promise"));
  });

  it("should reject the promise after the dalay", async () => {
    const p = delay(500);
    const q = timeout(p, 200);
    const res = await q.then(
      () => null,
      (x) => x
    );
    expect(res).toBeInstanceOf(Error);
    expect(res.message).toEqual("Timeout of 200ms exceeded");
  });

  it("should not reject the promise if it resolves", async () => {
    const p = delay(10, 10);
    expect(await timeout(p, 100)).toEqual(10);
  });

  it("should be rejeted by itself", async () => {
    const p = delay(10).then(() => {
      throw new Error("hello");
    });
    const q = await timeout(p, 100).then(
      () => null,
      (x) => x
    );
    expect(q).toBeInstanceOf(Error);
    expect(q.message).toEqual("hello");
  });

  it("should work for synchronous code", async () => {
    const q = await timeout(
      new Promise((resolve: Function) => {
        const t = new Date();
        process.nextTick(() => {
          while (new Date() - t < 200) {
            //
          }
          resolve();
        });
      }),
      100
    ).then(
      () => null,
      (x) => x
    );
    expect(q).toBeInstanceOf(Error);
    expect(q.message).toEqual("Timeout of 100ms exceeded");
  });

  it("should be rejected by timeout even if rejects by itself synchronously", async () => {
    const q = await timeout(
      new Promise((resolve, reject) => {
        const t = new Date();
        process.nextTick(() => {
          while (new Date() - t < 200) {
            //
          }
          reject(new Error("hello"));
        });
      }),
      100
    ).then(
      () => null,
      (x) => x
    );
    expect(q).toBeInstanceOf(Error);
    expect(q.message).toEqual("Timeout of 100ms exceeded");
    expect(q.original).toBeInstanceOf(Error);
    expect(q.original.message).toEqual("hello");
  });
});

describe("nodeify", () => {
  it("should pass the value as the second argument", (done) => {
    nodeify(Promise.resolve(10), (err, value) => {
      expect(value).toEqual(10);
      done();
    });
  });

  it("should pass null as the first argument if there is no error", (done) => {
    nodeify(Promise.resolve(), (err) => {
      expect(err).toBeNull();
      done();
    });
  });

  it("should pass the error as the first argument", (done) => {
    nodeify(Promise.reject(10), (err) => {
      expect(err).toEqual(10);
      done();
    });
  });

  it("should not pass the second argument if there is an error", (done) => {
    nodeify(Promise.reject(10), (...args) => {
      expect(args).toHaveLength(1);
      done();
    });
  });

  it("should return the passed promise", async () => {
    const p = Promise.resolve(10);
    expect(nodeify(p, noop)).toEqual(p);
  });

  it("should throw if the first argument is not a promise", () => {
    expect(() => {
      nodeify();
    }).toThrow(new TypeError("The first argument must be a promise"));
  });

  it("should return the promise if the second argument is not a function", () => {
    const p = Promise.resolve();
    expect(nodeify(p)).toEqual(p);
  });
});

describe("callbackify", () => {
  it("should convert an async function to a callback-based function", async () => {
    const fn = async (a, b) => a + b;
    const fn2 = callbackify(fn);
    const [err, res] = await new Promise((resolve) => {
      fn2(1, 2, (err, result) => {
        resolve([err, result]);
      });
    });
    expect(err).toBeNull();
    expect(res).toEqual(3);
  });

  it("should correctly handle errors", async () => {
    const fn = async (a, b) => {
      throw new Error(`hello ${a} + ${b}`);
    };
    const fn2 = callbackify(fn);
    const [err, res] = await new Promise((resolve) => {
      fn2(1, 2, (err, result) => {
        resolve([err, result]);
      });
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toEqual("hello 1 + 2");
    expect(res).toBeUndefined();
  });

  it("should not pop the last argument if it is not a callback", async () => {
    const fn = async (a, b) => a + b;
    const fn2 = callbackify(fn);
    const res = await fn2(1, 2);
    expect(res).toEqual(3);
  });
});

describe("promisify", () => {
  it("should turn a callback-based function into an async function", async () => {
    const getSecrets = (cb) => {
      cb(null, 123);
    };
    const getSecretsAsync = promisify(getSecrets);
    expect(getSecretsAsync).toBeInstanceOf(Function);
    expect(await getSecretsAsync()).toEqual(123);
  });

  it("should throw if the first argument of the callback truthy", async () => {
    const getSecrets = (cb) => {
      cb(1);
    };
    const f = promisify(getSecrets);
    expect(
      await f().then(
        () => null,
        (x) => x
      )
    ).toEqual(1);
  });

  it("should correctly handle synchronous errors", async () => {
    const getSecrets = () => {
      throw new Error("Nooo");
    };
    const f = promisify(getSecrets);
    const err = await f().then(
      () => null,
      (x) => x
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toEqual("Nooo");
  });

  it("should pass arguments", async () => {
    const getSecrets = (a, b, cb) => {
      cb(null, a + b);
    };
    const f = promisify(getSecrets);
    expect(await f(1, 2)).toEqual(3);
  });

  it("should pass the context", async () => {
    const getSecrets = function _(cb) {
      cb(null, this.a + this.b);
    };
    const f = promisify(getSecrets);
    expect(await f.call({ a: 1, b: 2 })).toEqual(3);
  });

  it("should throw if the first argument is not a function", () => {
    expect(() => {
      promisify();
    }).toThrow(new TypeError("The first argument must be a function"));
  });

  it("should use a custom context", async () => {
    const f = function _(cb) {
      cb(null, this.a + this.b);
    };

    const ctx = { a: 1, b: 1 };

    const g = promisify(f, { context: { a: 2, b: 2 } });

    expect(await g.call(ctx)).toEqual(4);
  });

  describe("multiArgs", () => {
    it("normal", async () => {
      const fn = (cb) => setImmediate(() => cb(null, "a", "b"));
      expect(await promisify(fn, { multiArgs: true })()).toStrictEqual(["a", "b"]);
    });

    it("rejection", async () => {
      const fixture1 = (cb) => setImmediate(() => cb("e", "a", "b"));
      expect(await promisify(fixture1, { multiArgs: true })().catch((error) => error)).toStrictEqual(["e", "a", "b"]);
    });
  });
});

describe("promisifyAll", () => {
  it("should promisify nested functions", async () => {
    const a = {
      f: (cb) => cb(null, 1),
      b: (cb) => cb(null, 2),
    };
    const b = promisifyAll(a);
    expect(await b.fAsync()).toEqual(1);
    expect(await b.bAsync()).toEqual(2);
  });

  it("should not modify the prev functions", () => {
    const a = {
      f: (cb) => cb(null, 1),
      b: (cb) => cb(null, 2),
    };
    const b = promisifyAll(a);
    expect(b.f).toEqual(a.f);
    expect(b.b).toEqual(a.b);
  });

  it("should wrap the source object", () => {
    const a = {
      f: (cb) => cb(null, 1),
      b: (cb) => cb(null, 2),
    };
    const b = promisifyAll(a);
    expect(a).not.toEqual(b);
    a.new = 1;
    expect(b.new).toEqual(1);
    b.new = 2;
    expect(a.new).toEqual(1);
  });

  it("should change the suffix", async () => {
    const a = {
      f: (cb) => cb(null, 1),
      b: (cb) => cb(null, 2),
    };
    const b = promisifyAll(a, { suffix: "_" });
    expect(await b.f_()).toEqual(1);
    expect(await b.b_()).toEqual(2);
  });

  it("should touch only functions", () => {
    const a = {
      s: "123",
      f: (cb) => cb(null, 1),
    };
    const b = promisifyAll(a);
    expect(b).toHaveProperty("fAsync");
    expect(b).not.toHaveProperty("sAsync");
  });

  it("should filter properties", () => {
    const a = {
      f: (cb) => cb(null, 1),
      b: (cb) => cb(null, 2),
    };
    const b = promisifyAll(a, {
      filter: (key) => key !== "b",
    });
    expect(b).toHaveProperty("fAsync");
    expect(b).not.toHaveProperty("bAsync");
  });

  it("should use a custom context", async () => {
    const a = {
      a: 1,
      b: 2,
      f(cb) {
        cb(null, this.a + this.b);
      },
      g(cb) {
        cb(null, this.b);
      },
    };
    const b = promisifyAll(a, { context: { a: 2, b: 3 } });
    expect(await b.fAsync()).toEqual(5);
    expect(await b.gAsync()).toEqual(3);
  });
});

describe("finally", () => {
  const fixture = Symbol("fixture");
  const fixtureErr = new Error("err");

  it("does nothing when nothing is passed", async () => {
    expect(await _finally(Promise.resolve(fixture))).toEqual(fixture);
  });

  it("callback is called when promise is fulfilled", async () => {
    let called = false;

    const val = await _finally(Promise.resolve(fixture), () => {
      called = true;
    });

    expect(val).toEqual(fixture);
    expect(called).toBeTruthy();
  });

  it("callback is called when promise is rejected", async () => {
    let called = false;

    await _finally(Promise.reject(fixtureErr), () => {
      called = true;
    }).catch((err) => {
      expect(err).toEqual(fixtureErr);
    });

    expect(called).toBeTruthy();
  });

  it("returning a rejected promise in the callback rejects the promise", async () => {
    await _finally(Promise.resolve(fixture), () => Promise.reject(fixtureErr)).then(
      () => {
        fail();
      },
      (err) => {
        expect(err).toEqual(fixtureErr);
      }
    );
  });

  it("returning a rejected promise in the callback for an already rejected promise changes the rejection reason", async () => {
    await _finally(Promise.reject(new Error("orig err")), () => Promise.reject(fixtureErr)).catch((err) => {
      expect(err).toEqual(fixtureErr);
    });
  });
});

// TODO: ??
describe("retry", () => {
  let soRejected;
  let soResolved;

  // beforeEach(() => {
  //   soRejected = Math.random().toString();
  //   soResolved = Math.random().toString();
  // });

  //   it("should reject immediately if max is 1 (using options)", async () => {
  //     const callback = stub();
  //     callback.resolves(soResolved);
  //     callback.onCall(0).rejects(new Error(soRejected));
  //     await assert.throws(async () => {
  //         await retry(callback, { max: 1, backoffBase: 0 });
  //     }, soRejected);
  //     expect(callback.callCount).to.equal(1);
  // });

  //   it("should reject immediately if max is 1 (using integer)", async () => {
  //     const callback = stub();
  //     callback.resolves(soResolved);
  //     callback.onCall(0).rejects(new Error(soRejected));
  //     await assert.throws(async () => {
  //       await retry(callback, 1);
  //     }, soRejected);
  //     expect(callback.callCount).to.equal(1);
  //   });

  //   it("should reject after all tries if still rejected", async () => {
  //     const callback = stub();
  //     callback.rejects(new Error(soRejected));
  //     await assert.throws(async () => {
  //       await retry(callback, { max: 3, backoffBase: 0 });
  //     }, soRejected);
  //     expect(callback.firstCall.args).to.deep.equal([{ current: 1 }]);
  //     expect(callback.secondCall.args).to.deep.equal([{ current: 2 }]);
  //     expect(callback.thirdCall.args).to.deep.equal([{ current: 3 }]);
  //     expect(callback.callCount).to.equal(3);
  //   });

  //   it("should resolve immediately if resolved on first try", async () => {
  //     const callback = stub();
  //     callback.resolves(soResolved);
  //     callback.onCall(0).resolves(soResolved);
  //     expect(await retry(callback, { max: 10, backoffBase: 0 })).to.be.equal(soResolved);
  //   });

  //   it("should resolve if resolved before hitting max", async () => {
  //     const callback = stub();
  //     callback.rejects(new Error(soRejected));
  //     callback.onCall(3).resolves(soResolved);
  //     expect(await retry(callback, { max: 10, backoffBase: 0 })).to.be.equal(soResolved);
  //     expect(callback.firstCall.args).to.deep.equal([{ current: 1 }]);
  //     expect(callback.secondCall.args).to.deep.equal([{ current: 2 }]);
  //     expect(callback.thirdCall.args).to.deep.equal([{ current: 3 }]);
  //     expect(callback.callCount).to.equal(4);
  //   });

  //   describe("timeout", () => {
  //     it("should throw if reject on first attempt", async () => {
  //       await assert.throws(async () => {
  //         await retry(() => promise.delay(1000), {
  //           max: 1,
  //           backoffBase: 0,
  //           timeout: 1000
  //         });
  //       }, error.TimeoutException);
  //     });

  //     it("should throw if reject on last attempt", async () => {
  //       let count = 0;
  //       await assert.throws(async () => {
  //         await retry(() => {
  //           count++;
  //           if (count === 3) {
  //             return promise.delay(3500);
  //           }
  //           return Promise.reject(new Error());
  //         }, {
  //           max: 3,
  //           backoffBase: 0,
  //           timeout: 1500
  //         });
  //       }, error.TimeoutException);
  //       expect(count).to.equal(3);
  //     });
  //   });

  //   describe("match", () => {
  //     it("should continue retry while error is equal to match string", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       callback.onCall(3).resolves(soResolved);
  //       expect(await retry(callback, { max: 15, backoffBase: 0, match: `Error: ${soRejected}` })).to.be.equal(soResolved);
  //       expect(callback.callCount).to.equal(4);
  //     });

  //     it("should reject immediately if error is not equal to match string", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       await assert.throws(async () => {
  //         await retry(callback, { max: 15, backoffBase: 0, match: "A custom error string" });
  //       }, soRejected);
  //       expect(callback.callCount).to.equal(1);
  //     });

  //     it("should continue retry while error is instanceof match", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       callback.onCall(4).resolves(soResolved);

  //       expect(await retry(callback, { max: 15, backoffBase: 0, match: Error })).to.be.equal(soResolved);
  //       expect(callback.callCount).to.equal(5);
  //     });

  //     it("should reject immediately if error is not instanceof match", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       await assert.throws(async () => {
  //         await retry(callback, { max: 15, backoffBase: 0, match() { } });
  //       }, Error);
  //       expect(callback.callCount).to.equal(1);
  //     });

  //     it("should continue retry while error is equal to match string in array", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       callback.onCall(4).resolves(soResolved);
  //       expect(await retry(callback, { max: 15, backoffBase: 0, match: [`Error: ${soRejected + 1}`, `Error: ${soRejected}`] })).to.be.equal(soResolved);
  //       expect(callback.callCount).to.equal(5);
  //     });

  //     it("should reject immediately if error is not equal to match string in array", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       await assert.throws(async () => {
  //         await retry(callback, { max: 15, backoffBase: 0, match: [`Error: ${soRejected + 1}`, `Error: ${soRejected + 2}`] });
  //       }, Error);
  //       expect(callback.callCount).to.equal(1);
  //     });

  //     it("should reject immediately if error is not instanceof match in array", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       await assert.throws(async () => {
  //         await retry(callback, { max: 15, backoffBase: 0, match: [`Error: ${soRejected + 1}`, function foo() { }] });
  //       }, Error);
  //       expect(callback.callCount).to.equal(1);
  //     });

  //     it("should continue retry while error is instanceof match in array", async () => {
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       callback.onCall(4).resolves(soResolved);
  //       expect(await retry(callback, { max: 15, backoffBase: 0, match: [`Error: ${soRejected + 1}`, Error] })).to.be.equal(soResolved);
  //       expect(callback.callCount).to.equal(5);
  //     });
  //   });

  //   describe("backoff", () => {
  //     it("should resolve after 5 retries and an eventual delay over 1800ms using default backoff", async () => {
  //       const startTime = ateos.datetime();
  //       const callback = stub();
  //       callback.rejects(new Error(soRejected));
  //       callback.onCall(5).resolves(soResolved);
  //       expect(await retry(callback, { max: 15 })).to.be.equal(soResolved);
  //       expect(ateos.datetime().diff(startTime)).to.be.above(1800);
  //       expect(ateos.datetime().diff(startTime)).to.be.below(3400);
  //     });

  //     it("should resolve after 1 retry and initial delay equal to the backoffBase", async () => {
  //       const initialDelay = 100;
  //       const callback = stub();
  //       const startTime = ateos.datetime();
  //       callback.onCall(0).rejects(new Error(soRejected));
  //       callback.onCall(1).resolves(soResolved);
  //       expect(await retry(callback, { max: 2, backoffBase: initialDelay, backoffExponent: 3 })).to.be.equal(soResolved);
  //       expect(callback.callCount).to.equal(2);
  //       expect(ateos.datetime().diff(startTime)).to.be.within(initialDelay, initialDelay + 50); // allow for some overhead
  //     });

  //     it("should throw TimeoutError and cancel backoff delay if timeout is reached", async () => {
  //       await assert.throws(async () => {
  //         await retry(() => {
  //           return promise.delay(2000);
  //         }, {
  //           max: 3,
  //           timeout: 1000
  //         });
  //       }, error.TimeoutException);
  //     });
  //   });
});

describe("props", () => {
  it("should return a promise that is fulfilled when all the values are fulfilled", async () => {
    const obj = await props({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
    });

    expect(obj.a).toEqual(1);
    expect(obj.b).toEqual(2);
  });

  it("should return a new object", async () => {
    const obj = {
      a: Promise.resolve(1),
      b: Promise.resolve(2),
    };
    const obj2 = await props(obj);
    expect(obj2).not.toEqual(obj);
    expect(obj.a).toBeInstanceOf(Promise);
    expect(obj.b).toBeInstanceOf(Promise);
  });

  it("should throw if something goes wrong", async () => {
    const obj = {
      a: Promise.resolve(1),
      b: Promise.reject(new Error("oops")),
    };

    await expect(async () => {
      await props(obj);
    }).rejects.toThrow(new Error("oops"));
  });
});

describe("try", () => {
  const fixture = Symbol("fixture");
  const fixtureError = new Error("fixture");

  it("main", async () => {
    expect(await _try(() => fixture)).toEqual(fixture);

    await expect(async () => _try(() => Promise.reject(fixtureError))).rejects.toThrow(new Error("fixture"));

    await expect(async () =>
      _try(() => {
        throw fixtureError;
      })
    ).rejects.toThrow(new Error("fixture"));
  });

  it("allows passing arguments through", async () => {
    expect(await _try((argument) => argument, fixture)).toEqual(fixture);
  });
});
