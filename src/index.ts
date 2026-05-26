import { AutoSwaggerGenerator } from "./autoswagger.js";

export { AutoSwagger } from "./decorators.js";
export type {
  AutoSwaggerBody,
  AutoSwaggerHeader,
  AutoSwaggerHeaderMap,
  AutoSwaggerOptions,
  AutoSwaggerParameter,
  AutoSwaggerParameterMap,
  AutoSwaggerResponse,
  AutoSwaggerResponseMap,
  AutoSwaggerVineValidator,
} from "./decorators.js";

export default new AutoSwaggerGenerator();
