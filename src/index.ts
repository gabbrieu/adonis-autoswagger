import { AutoSwaggerGenerator } from "./autoswagger.js";

export { AutoSwagger } from "./decorators.js";
export type {
  AutoSwaggerBody,
  AutoSwaggerDecoratorOptions,
  AutoSwaggerHeader,
  AutoSwaggerHeaderMap,
  AutoSwaggerParameter,
  AutoSwaggerParameterMap,
  AutoSwaggerResponse,
  AutoSwaggerResponseMap,
  AutoSwaggerVineValidator,
} from "./decorators.js";

export type {
  AdonisRoute,
  AdonisRouteMeta,
  AdonisRoutes,
  AutoSwaggerConfigOptions,
  Common,
  V6Handler,
} from "./types.js";

export default new AutoSwaggerGenerator();
