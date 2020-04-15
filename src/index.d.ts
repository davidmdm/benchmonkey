declare type Options = {
  tolerance?: number;
  iterations?: number;
};

declare type SuiteFunction = (name: string, optsOrFunc: Options | (() => any), func?: () => any) => void;
declare const describe: SuiteFunction;
declare const it: SuiteFunction;

export { describe, it };
