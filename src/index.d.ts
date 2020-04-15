type Options = {
  tolerance?: number;
  iterations?: number;
};

type SuiteFunction = (name: string, optsOrFunc: Options | (() => any), func?: () => any) => void;

declare var describe: SuiteFunction;
declare var it: SuiteFunction;
