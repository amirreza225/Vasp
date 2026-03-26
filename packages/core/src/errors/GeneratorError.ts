import { VaspError } from "./VaspError.js";

export class GeneratorError extends VaspError {
  constructor(
    message: string,
    public readonly generatorName: string,
    public override readonly cause?: unknown,
  ) {
    super(message, "GENERATOR_ERROR");
    this.name = "GeneratorError";
  }
}
