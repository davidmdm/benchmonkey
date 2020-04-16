declare type Options = {
  tolerance?: number;
  iterations?: number;
};

declare type DescribeFunction = (name: string, optsOrFunc: Options | (() => any), func?: () => any) => void;
declare type ItFunction = (name: string, optsOrFunc: Options | (() => () => any), func?: () => () => any) => void;

declare const describe: DescribeFunction;
declare const it: ItFunction;

export { describe, it };
