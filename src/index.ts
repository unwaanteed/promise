import { noop, truly, isArray, entries, isNumber, isPromise, isFunction, isUndefined } from "@unwanted/common";

export type Deferred = {
  resolve?: Function;
  reject?: Function;
  promise?: Promise<any>;
};

/**
 * @typedef Deferred
 * @property {Function} resolve
 * @property {Function} reject
 * @property {Promise} promise
 */

/**
 * Creates a promise and returns an interface to control the state
 *
 * @returns {Deferred}
 */
export const defer = () => {
  const deferred: Deferred = {};

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
};

/**
 * Returns a promise that will be resolved after given milliseconds
 *
 * @template T
 * @param {number} ms delay in milliseconds
 * @param {T} [value] resolving value
 * @returns {Promise<T>}
 */
export const delay = (ms: number, value?: any, options?: { unref?: boolean }) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms, value);
    if (options && options.unref) {
      timer.unref();
    }
  });

/**
 * Creates a promise that will be rejected after given milliseconds if the given promise is not fulfilled
 *
 * @template T
 * @param {Promise<T>} promise promise to wrap
 * @param {number} ms timeout in milliseconds
 * @returns {Promise<T>}
 */
export const timeout = (promise: Promise<any>, ms: number) => {
  if (!isPromise(promise)) {
    throw new TypeError("The first argument must be a promise");
  }
  return new Promise((resolve, reject) => {
    const timestamp = new Date();
    const timer = setTimeout(() => {
      reject(new Error(`Timeout of ${ms}ms exceeded`));
    }, ms);
    promise.then(
      (x) => {
        clearTimeout(timer);
        // @ts-ignore
        if (new Date() - timestamp >= ms) {
          reject(new Error(`Timeout of ${ms}ms exceeded`));
        } else {
          resolve(x);
        }
      },
      (y) => {
        clearTimeout(timer);
        // @ts-ignore
        if (new Date() - timestamp >= ms) {
          const err = new Error(`Timeout of ${ms}ms exceeded`);
          Object.defineProperty(err, "original", {
            enumerable: true,
            value: y,
          });
          reject(err);
        } else {
          reject(y);
        }
      }
    );
  });
};

/**
 * Converts a promise to node.js style callback
 *
 * @param {Promise} promise
 * @param {Function} cb
 */
export const nodeify = (promise: Promise<any>, cb: Function) => {
  if (!isPromise(promise)) {
    throw new TypeError("The first argument must be a promise");
  }
  if (!isFunction(cb)) {
    return promise;
  }
  promise.then(
    (x) => {
      cb(null, x);
    },
    (y) => {
      cb(y);
    }
  );
  return promise;
};

/**
 * Converts a function that returns promises to a node.js style callback function
 *
 * @param {Function} fn Function
 * @returns {Promise} the original promise
 */
export const callbackify = (fn: Function) => {
  if (!isFunction(fn)) {
    throw new TypeError("The first argument must be a function");
  }
  return function _(...args: any[]) {
    if (args.length && isFunction(args[args.length - 1])) {
      const cb = args.pop();
      // @ts-ignore
      return nodeify(fn.apply(this, args), cb);
    }
    // @ts-ignore
    return fn.apply(this, args);
  };
};

const processFn = (
  fn: Function,
  context: any,
  args: any[],
  multiArgs: boolean,
  resolve: Function,
  reject: Function
) => {
  if (multiArgs) {
    args.push((...result: any[]) => {
      if (result[0]) {
        reject(result);
      } else {
        result.shift();
        resolve(result);
      }
    });
  } else {
    args.push((err: any, result: any) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  }
  fn.apply(context, args);
};

/**
 * Converts a callback function to a promise-based function
 *
 * @param {Function} fn
 * @param {object} [context] Context to bind to new function
 * @returns {Function}
 */
export const promisify = (fn: Function, options?: { context?: any; multiArgs?: boolean }) => {
  if (!isFunction(fn)) {
    throw new TypeError("The first argument must be a function");
  }

  return options && options.context
    ? (...args: any[]) =>
        new Promise((resolve, reject) => {
          processFn(fn, options.context, args, options && Boolean(options.multiArgs), resolve, reject);
        })
    : function _(...args: any[]) {
        return new Promise((resolve, reject) => {
          // @ts-ignore
          processFn(fn, this, args, Boolean(options?.multiArgs), resolve, reject);
        });
      };
};

/**
 * Promisifies entire object
 *
 * @param {object} source
 * @param {string} [suffix] Suffix to use for keys
 * @param {Function} [filter] Function to filter keys
 * @param {object} [context] Context to bind to new functions
 * @returns {object} object with promisified functions
 */
export const promisifyAll = (source: any, options?: { suffix?: string; filter: Function; context?: any }) => {
  const suffix = options && options.suffix ? options.suffix : "Async";
  const filter = options && typeof options.filter === "function" ? options.filter : truly;

  if (isFunction(source)) {
    return promisify(source, options);
  }

  const target = Object.create(source);
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, value] of entries(source, { all: true })) {
    if (isFunction(value) && filter(key)) {
      target[`${key}${suffix}`] = promisify(value, options);
    }
  }
  return target;
};

/**
 * Executes function after promise fulfillment
 *
 * @param {Promise} promise promise to wrap
 * @param {Function} onFinally callback to call
 * @returns {Promise} a promise that will be fulfilled using the original value
 */
const _finally = (promise: Promise<any>, onFinally: Function) => {
  onFinally = onFinally || noop;

  return promise.then(
    (val) =>
      new Promise((resolve) => {
        resolve(onFinally());
      }).then(() => val),
    (err) =>
      new Promise((resolve) => {
        resolve(onFinally());
      }).then(() => {
        throw err;
      })
  );
};

export { _finally as finally };

/**
 * Calls the given function after some timeout until the result is returned or it cannot be restarted anymore
 */
export const retry = async (callback: Function, options: any) => {
  if (!callback || !options) {
    throw new Error("requires a callback and an options set or a number");
  }

  if (isNumber(options)) {
    options = { max: options };
  }

  options = {
    $current: options.$current || 1,
    max: options.max,
    timeout: options.timeout || undefined,
    match: options.match || [],
    backoffBase: isUndefined(options.backoffBase) ? 100 : options.backoffBase,
    backoffExponent: options.backoffExponent || 1.1,
    report: options.report || null,
    name: options.name || callback.name || "unknown",
  };

  // Massage match option into array so we can blindly treat it as such later
  if (!isArray(options.match)) {
    options.match = [options.match];
  }

  if (options.report) {
    options.report(`Trying ${options.name} #${options.$current} at ${new Date().toLocaleTimeString()}`, options);
  }

  for (;;) {
    try {
      let p = Promise.resolve(callback({ current: options.$current }));
      if (options.timeout) {
        p = timeout(p, options.timeout);
      }
      // eslint-disable-next-line no-await-in-loop
      return await p;
    } catch (err: any) {
      if (options.report) {
        options.report(`Try ${options.name} #${options.$current} failed: ${err.toString()}`, options, err);
      }
      let shouldRetry = options.$current < options.max;
      if (shouldRetry && options.match.length && err) {
        // If match is defined we should fail if it is not met
        shouldRetry = options.match.reduce((shouldRetry_: true, match: any) => {
          if (shouldRetry_) {
            return shouldRetry_;
          }

          if (
            match === err.toString() ||
            match === err.message ||
            (isFunction(match) && err instanceof match) ||
            (match instanceof RegExp && (match.test(err.message) || match.test(err.toString())))
          ) {
            shouldRetry_ = true;
          }
          return shouldRetry_;
        }, false);
      }

      if (!shouldRetry) {
        throw err;
      }

      const retryDelay = options.backoffBase ** (options.backoffExponent ** (options.$current - 1));
      options.$current++;
      if (retryDelay) {
        if (options.report) {
          options.report(`Delaying retry of ${options.name} by ${retryDelay}`, options);
        }
        // eslint-disable-next-line no-await-in-loop
        await delay(retryDelay);
      }
    }
  }
};

export const props = async (obj: any) => {
  const result = {};
  await Promise.all(
    Object.keys(obj).map(async (key) => {
      Object.defineProperty(result, key, {
        enumerable: true,
        value: await obj[key],
      });
    })
  );
  return result;
};

const try_ = (fn: Function, ...args: any[]) =>
  new Promise((resolve) => {
    resolve(fn(...args));
  });

export { try_ as try };

export const universalify = (fn: Function) =>
  Object.defineProperties(
    function _(...args: any[]) {
      if (isFunction(args[args.length - 1])) {
        // @ts-ignore
        return fn.apply(this, args);
      }
      return new Promise((resolve, reject) => {
        args.push((err: any, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
        // @ts-ignore
        fn.apply(this, args);
      });
    },
    {
      name: {
        value: fn.name,
      },
      ...Object.keys(fn).reduce((props_, k) => {
        // @ts-ignore
        props_[k] = {
          enumerable: true,
          // @ts-ignore
          value: fn[k],
        };
        return props_;
      }, {}),
    }
  );

export const universalifyFromPromise = (fn: Function) =>
  Object.defineProperty(
    function _(...args: any[]) {
      const cb = args[args.length - 1];
      if (!isFunction(cb)) {
        // @ts-ignore
        return fn.apply(this, args);
      }
      // @ts-ignore
      return fn.apply(this, args).then((r: any) => cb(null, r), cb);
    },
    "name",
    { value: fn.name }
  );
