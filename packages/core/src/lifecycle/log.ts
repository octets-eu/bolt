import type { Context } from '../context';

/**
 * Method decorator: every call runs as a lifecycle step named
 * `<logName>.<method>`, see Lifecycle.run. Internal calls (`this.rotate()`)
 * are steps as well: the method on the prototype is the wrapper.
 */
export function log<This extends { readonly logName: string; readonly ctx: Context }, Args extends unknown[], R> (
  method: (this: This, ...args: Args) => Promise<R>,
  context: ClassMethodDecoratorContext<This>,
): (this: This, ...args: Args) => Promise<R> {
  const methodName = String(context.name);
  return function (this: This, ...args: Args): Promise<R> {
    return this.ctx.run(`${this.logName}.${methodName}`, () => method.apply(this, args));
  };
}
