/**
 * Autoswagger generator configuration.
 */
export interface AutoSwaggerConfigOptions {
  /**
   * API title used in the generated OpenAPI `info.title` field when `info` is not provided.
   *
   * @deprecated Prefer the `info` option for full OpenAPI info metadata.
   * @example
   * title: "Inventory API"
   */
  title?: string;

  /**
   * Route patterns that should not be included in the generated documentation.
   *
   * Supports glob patterns. Use `*` to match any sequence of characters and `?`
   * to match a single character.
   *
   * @example
   * ignore: ["/swagger", "/docs", "/admin/*", "✶/health", "/v?/users"]
   */
  ignore: string[];

  /**
   * API version used in the generated OpenAPI `info.version` field when `info` is not provided.
   *
   * @deprecated Prefer the `info` option for full OpenAPI info metadata.
   * @example
   * version: "1.0.0"
   */
  version?: string;

  /**
   * API description used in the generated OpenAPI `info.description` field when `info` is not provided.
   *
   * @deprecated Prefer the `info` option for full OpenAPI info metadata.
   * @example
   * description: "Public endpoints for the Inventory API."
   */
  description?: string;

  /**
   * Absolute project root path used to read source files and to write generated `swagger.yml`
   * and `swagger.json` files.
   *
   * This should point to the AdonisJS application root and usually ends with a trailing slash.
   *
   * @example
   * path: path.dirname(url.fileURLToPath(import.meta.url)) + "/../"
   */
  path: string;

  /**
   * Zero-based segment index used to derive the OpenAPI tag from each route path.
   *
   * The route path is split by `/`. For `/api/v1/products`, index `3` selects `products`;
   * for `/v1/products`, index `2` selects `products`; for `/products`, index `1`
   * selects `products`.
   *
   * @example
   * tagIndex: 2
   */
  tagIndex: number;

  /**
   * Converts model, interface, and example property names to snake_case in generated schemas.
   *
   * Set to `false` when your API exposes camelCase or another naming style and you want
   * generated schema properties to keep their source names.
   *
   * @default true
   * @example
   * snakeCase: true
   */
  snakeCase: boolean;

  /**
   * Shared OpenAPI parameters and response headers that can be reused by decorators.
   *
   * `common.parameters` entries are referenced through decorator `paramUse`, and
   * `common.headers` entries are referenced through decorator `responseHeaderUse`.
   *
   * @example
   * common: {
   *   parameters: { pagination: [{ name: "page", in: "query", schema: { type: "integer" } }] },
   *   headers: { requestId: { "X-Request-Id": { schema: { type: "string" } } } }
   * }
   */
  common: Common;

  /**
   * Reserved option for including the source file name in generated summaries.
   *
   * This option is currently declared for compatibility, but the generator does not read it.
   */
  fileNameInSummary?: boolean;

  /**
   * Shows the controller source path and action name at the end of each generated operation description.
   *
   * Decorator-level `hideControllerPath` can override this behavior per action.
   *
   * @default false
   * @example
   * showFullPath: true
   */
  showFullPath?: boolean;

  /**
   * HTTP method to keep when Adonis exposes both `PUT` and `PATCH` for the same route.
   *
   * Any sibling method that does not match this value is skipped, avoiding duplicate
   * OpenAPI path entries for the same operation.
   *
   * @default "PUT"
   * @example
   * preferredPutPatch: "PATCH"
   */
  preferredPutPatch?: string;

  /**
   * Enables Swagger UI `persistAuthorization`, keeping entered authorization values
   * after the documentation page reloads.
   *
   * This only affects the HTML returned by `AutoSwagger.ui(...)`.
   *
   * @example
   * persistAuthorization: true
   */
  persistAuthorization?: boolean;

  /**
   * Internal application source path used while scanning controllers, validators, serializers,
   * models, interfaces, and types.
   *
   * The generator derives this from `path + "app"` during generation, so user config normally
   * should not set it manually.
   *
   * @internal
   */
  appPath?: string;

  /**
   * Prints debug information while generating documentation, including resolved options,
   * discovered schemas, custom import paths, and route decorator lookup details.
   *
   * @default false
   * @example
   * debug: true
   */
  debug?: boolean;

  /**
   * Complete OpenAPI `info` object. When provided, it replaces `title`, `version`, and
   * `description` in the generated document.
   *
   * @example
   * info: {
   *   title: "Inventory API",
   *   version: "1.0.0",
   *   description: "Public endpoints for inventory management."
   * }
   */
  info?: any;

  /**
   * Additional or overriding OpenAPI security schemes added to `components.securitySchemes`.
   *
   * AutoSwagger includes `BearerAuth`, `BasicAuth`, and `ApiKeyAuth` by default. Values
   * provided here are merged after those defaults, so matching keys override them.
   *
   * @example
   * securitySchemes: {
   *   ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" }
   * }
   */
  securitySchemes?: any;

  /**
   * Environment name that makes `json()` and `docs()` read pre-generated Swagger files
   * instead of generating documentation from routes at runtime.
   *
   * The generator compares this value with `process.env.NODE_ENV`.
   *
   * @default "production"
   * @example
   * productionEnv: "production"
   */
  productionEnv?: string;

  /**
   * Middleware names that should mark an operation as protected in the OpenAPI output.
   *
   * `auth` and `auth:api` are always included. Add custom authentication middleware names
   * here so routes using them receive an OpenAPI `security` entry.
   *
   * @example
   * authMiddlewares: ["auth", "auth:api", "auth:admin"]
   */
  authMiddlewares?: string[];

  /**
   * Security scheme name used for routes protected by detected auth middleware.
   *
   * Must match one of the built-in schemes (`BearerAuth`, `BasicAuth`, `ApiKeyAuth`) or a
   * custom key supplied in `securitySchemes`.
   *
   * @default "BearerAuth"
   * @example
   * defaultSecurityScheme: "ApiKeyAuth"
   */
  defaultSecurityScheme?: string;
}

export interface Common {
  headers: any;
  parameters: any;
}

/**
 * Adonis routes
 */
export interface AdonisRouteMeta {
  resolvedHandler: {
    type: string;
    namespace?: string;
    method?: string;
  };
  resolvedMiddleware: Array<{
    type: string;
    args?: any[];
  }>;
}

export interface V6Handler {
  method?: string;
  moduleNameOrPath?: string;
  reference: string | any[];
  name: string;
}

export interface AdonisRoute {
  methods: string[];
  pattern: string;
  meta: AdonisRouteMeta;
  middleware: string[] | any;
  name?: string;
  params: string[];
  handler?: string | V6Handler;
}

export interface AdonisRoutes {
  root: AdonisRoute[];
}

export const standardTypes = [
  "string",
  "number",
  "integer",
  "datetime",
  "date",
  "boolean",
  "any",
]
  .map((type) => [type, type + "[]"])
  .flat();
