<h1 align="center">
Adonis AutoSwagger <br />
<img src="https://upload.wikimedia.org/wikipedia/commons/a/ab/Swagger-logo.png" height="50" />
</h1>

[![Version](https://img.shields.io/github/tag/gabbrieu/adonis-autoswagger.svg?style=flat?branch=main)]()
[![GitHub stars](https://img.shields.io/github/stars/gabbrieu/adonis-autoswagger.svg?style=social&label=Star)]()
[![GitHub watchers](https://img.shields.io/github/watchers/gabbrieu/adonis-autoswagger.svg?style=social&label=Watch)]()
[![GitHub forks](https://img.shields.io/github/forks/gabbrieu/adonis-autoswagger.svg?style=social&label=Fork)]()

### Auto-Generate swagger docs for AdonisJS

## 💻️ Install

```bash
yarn add adonis-autoswagger
```

---

## ⭐️ Features

- Creates **paths** automatically based on `routes.ts`
- Creates **schemas** automatically based on `app/Models/*`
- Creates **schemas** automatically based on `app/Interfaces/*`
- Creates **schemas** automatically based on `app/Validators/*` (only for adonisJS v6)
- Creates **schemas** automatically based on `app/Types/*` (only for adonisJS v6)
- **Rich configuration** via decorators
- Works also in **production** mode
- `node ace docs:generate` command

---

## ✌️Usage

Create a file `/config/swagger.ts`

```ts
// for AdonisJS v6
import path from "node:path";
import url from "node:url";
// ---

export default {
  // path: __dirname + "/../", for AdonisJS v5
  path: path.dirname(url.fileURLToPath(import.meta.url)) + "/../", // for AdonisJS v6
  title: "Foo", // use info instead
  version: "1.0.0", // use info instead
  description: "", // use info instead
  tagIndex: 2,
  productionEnv: "production", // optional
  info: {
    title: "title",
    version: "1.0.0",
    description: "",
  },
  snakeCase: true,

  debug: false, // set to true, to get some useful debug output
  ignore: ["/swagger", "/docs"],
  preferredPutPatch: "PUT", // if PUT/PATCH are provided for the same route, prefer PUT
  common: {
    parameters: {}, // OpenAPI conform parameters that are commonly used
    headers: {}, // OpenAPI conform headers that are commonly used
  },
  securitySchemes: {}, // optional
  authMiddlewares: ["auth", "auth:api"], // optional
  defaultSecurityScheme: "BearerAuth", // optional
  persistAuthorization: true, // persist authorization between reloads on the swagger page
  showFullPath: false, // show the controller path after endpoint description
};
```

In your `routes.ts`

## 6️⃣ for AdonisJS v6

```js
import AutoSwagger from "@gabbrieu/adonis-autoswagger";
import swagger from "#config/swagger";
// returns swagger in YAML
router.get("/swagger", async () => {
  return AutoSwagger.default.docs(router.toJSON(), swagger);
});

// Renders Swagger-UI and passes YAML-output of /swagger
router.get("/docs", async () => {
  return AutoSwagger.default.ui("/swagger", swagger);
  // return AutoSwagger.default.scalar("/swagger"); to use Scalar instead. If you want, you can pass proxy url as second argument here.
  // return AutoSwagger.default.rapidoc("/swagger", "view"); to use RapiDoc instead (pass "view" default, or "read" to change the render-style)
});
```

## 5️⃣ for AdonisJS v5

```js
import AutoSwagger from "@gabbrieu/adonis-autoswagger";
import swagger from "Config/swagger";
// returns swagger in YAML
Route.get("/swagger", async () => {
  return AutoSwagger.docs(Route.toJSON(), swagger);
});

// Renders Swagger-UI and passes YAML-output of /swagger
Route.get("/docs", async () => {
  return AutoSwagger.ui("/swagger", swagger);
});
```

### 👍️ Done

Visit `http://localhost:3333/docs` to see AutoSwagger in action.

### Functions

- `async docs(routes, conf)`: get the specification in YAML format
- `async json(routes, conf)`: get the specification in JSON format
- `ui(path, conf)`: get default swagger UI
- `rapidoc(path, style)`: get rapidoc UI
- `scalar(path, proxyUrl)`: get scalar UI
- `stoplight(path, theme)`: get stoplight elements UI
- `jsonToYaml(json)`: can be used to convert `json()` back to yaml

---

## 💡 Compatibility

For controllers to get detected properly, please load them lazily.

```ts
✅ const TestController = () => import('#controllers/test_controller')
❌ import TestController from '#controllers/test_controller'
```

## 🧑‍💻 Advanced usage

### Additional configuration

**info**
See [Swagger API General Info](https://swagger.io/docs/specification/api-general-info/) for details.

**securitySchemes**

Add/Overwrite security schemes [Swagger Authentication](https://swagger.io/docs/specification/authentication/) for details.

```ts
// example to override ApiKeyAuth
securitySchemes: {
  ApiKeyAuth: {
    type: "apiKey"
    in: "header",
    name: "X-API-Key"
  }
}
```

**defaultSecurityScheme**

Override the default security scheme.

- BearerAuth
- BasicAuth
- ApiKeyAuth
- your own defined under `securitySchemes`

**authMiddlewares**

If a route uses a middleware named `auth`, `auth:api`, AutoSwagger will detect it as a Swagger security method. However, you can implement other middlewares that handle authentication.

### Modify generated output

```ts
Route.get("/myswagger", async () => {
  const json = await AutoSwagger.json(Route.toJSON(), swagger);
  // modify json to your hearts content
  return AutoSwagger.jsonToYaml(json);
});

Route.get("/docs", async () => {
  return AutoSwagger.ui("/myswagger", swagger);
});
```

### Custom Paths in adonisJS v6

AutoSwagger supports the paths set in `package.json`. Interfaces are expected to be in `app/interfaces`. However, you can override this, by modifying package.json as follows.

```json
//...
"imports": {
  // ...
  "#interfaces/*": "./app/custom/path/interfaces/*.js"
  // ...
}
//...

```

---

## 📃 Configure

### `tagIndex`

Tags endpoints automatically

- If your routes are `/api/v1/products/...` then your tagIndex should be `3`
- If your routes are `/v1/products/...` then your tagIndex should be `2`
- If your routes are `/products/...` then your tagIndex should be `1`

### `ignore`

Ignores specified paths using glob patterns. Use `*` to match any sequence of characters and `?` to match a single character.
`/test/*` ignores everything starting with `/test/`, `*/test` ignores everything ending with `/test`, and `/v?/users` matches paths like `/v1/users` and `/v2/users`.

### `common`

Sometimes you want to use specific parameters or headers on multiple responses.

_Example:_ Some resources use the same filter parameters or return the same headers.

Here's where you can set these and use them with `paramUse` and `responseHeaderUse`. See practical example for further details.

---

# 💫 Extend Controllers

## Add additional documentation to your Controller methods

Import the method decorator and place it directly above the controller method.

```ts
import { AutoSwagger } from "@gabbrieu/adonis-autoswagger";
```

**summary**
A summary of what the action does.

**tag**
Set a custom tag for this action.

**description**
A detailed description of what the action does.

**hideControllerPath**
Hides the generated controller file path and action from the operation description. Defaults to `true`. Set it to `false` on a route to show the path for that action.

**operationId**
An optional unique string used to identify an operation. If provided, these IDs must be unique among all operations described in your API.

**responseBody**
A map keyed by HTTP status. Values can be a schema reference string, a class/model value, a validator, a custom object, or a wrapper with `body`, `description`, and `headers`.

**responseHeaderUse**
A map keyed by HTTP status with names from `config/swagger.ts` `common.headers`.

**paramPath**, **paramQuery**, **paramHeader**, **paramCookie**
Parameter maps keyed by parameter name. Each parameter accepts `description`, `type`, `required`, `example`, `enum`, or a full `schema`.

**paramUse**
An array of names from `config/swagger.ts` `common.parameters`.

**requestBody**
A definition of the expected request body. It can be a validator, a schema reference string like `'<Model>'`, a class/model value, or a custom object.

**requestFormDataBody**
A definition of the expected request body using `multipart/form-data`.

---

# 🤘Examples

## Decorator examples

```ts
@AutoSwagger({
  responseBody: {
    200: '<Product[]>.with(relations)',
    404: {
      description: 'Product could not be found',
    },
  },
  responseHeaderUse: {
    200: ['paginated'],
  },
  paramPath: {
    id: {
      description: 'The ID of the source',
      type: 'number',
      required: true,
    },
  },
  paramQuery: {
    page: {
      description: 'The page number',
      type: 'number',
    },
  },
  requestBody: '<Product>',
  hideControllerPath: false,
})
```

Reference strings still support `.with()`, `.exclude()`, `.append()`, `.paginated()`, `.only()`, and array refs like `'<Product[]>'`.

```ts
@AutoSwagger({
  requestFormDataBody: {
    name: { type: 'string' },
    picture: { type: 'string', format: 'binary' },
  },
  responseBody: {
    200: {
      body: { token: 'string' },
      description: 'Authenticated',
      headers: {
        'X-Request-Id': {
          description: 'Request identifier',
          schema: { type: 'string', example: 'req_123' },
        },
      },
    },
  },
})
```

---

# **Practical example**

`config/swagger.ts`

```ts
export default {
  path: __dirname + "../",
  title: "YourProject",
  version: "1.0.0",
  tagIndex: 2,
  ignore: ["/swagger", "/docs", "/v1", "/", "/something/*", "*/something"],
  common: {
    parameters: {
      sortable: [
        {
          in: "query",
          name: "sortBy",
          schema: { type: "string", example: "foo" },
        },
        {
          in: "query",
          name: "sortType",
          schema: { type: "string", example: "ASC" },
        },
      ],
    },
    headers: {
      paginated: {
        "X-Total-Pages": {
          description: "Total amount of pages",
          schema: { type: "integer", example: 5 },
        },
        "X-Total": {
          description: "Total amount of results",
          schema: { type: "integer", example: 100 },
        },
        "X-Per-Page": {
          description: "Results per page",
          schema: { type: "integer", example: 20 },
        },
      },
    },
  },
};
```

`app/Controllers/Http/SomeController.ts`

```ts
import { AutoSwagger } from "@gabbrieu/adonis-autoswagger";
import {
  createProductValidator,
  updateProductValidator,
} from "#validators/product";

export default class SomeController {
  @AutoSwagger({
    operationId: "getProducts",
    description: "Returns array of products and its relations",
    responseBody: {
      200: "<Product[]>.with(relations)",
    },
    paramUse: ["sortable", "filterable"],
    responseHeaderUse: {
      200: ["paginated"],
    },
  })
  public async index({ request, response }: HttpContextContract) {}

  @AutoSwagger({
    description:
      "Returns a product with its relation on user and user relations",
    paramPath: {
      id: {
        description: "Describe the path param",
        type: "string",
        required: true,
      },
    },
    paramQuery: {
      foo: {
        description: "Describe the query param",
        type: "string",
        required: true,
      },
    },
    responseBody: {
      200: "<Product>.with(user, user.relations)",
      404: {
        description: "Product could not be found",
      },
    },
  })
  public async show({ request, response }: HttpContextContract) {}

  @AutoSwagger({
    requestBody: updateProductValidator,
    responseBody: {
      200: "<Product>",
      404: {
        description: "Product could not be found",
      },
    },
  })
  public async update({ request, response }: HttpContextContract) {}

  @AutoSwagger({
    summary: "Lorem ipsum dolor sit amet",
    paramPath: {
      provider: {
        description: "The login provider to be used",
        enum: ["google", "facebook", "apple"],
      },
    },
    responseBody: {
      200: { token: "string" },
    },
    requestBody: createProductValidator,
  })
  public async myCustomFunction({ request, response }: HttpContextContract) {}
}
```

---

## What does it do?

AutoSwagger tries to extracat as much information as possible to generate swagger-docs for you.

## Paths

Automatically generates swagger path-descriptions, based on your application routes. It also detects endpoints, protected by the auth-middlware.

![paths](https://i.imgur.com/EnPw6xT.png)

### Responses and RequestBody

Generates responses and requestBody based on your controller decorators (see Examples)

---

## Schemas

### Models

Automatically generates swagger schema-descriptions based on your models

![alt](https://i.imgur.com/FEdLplp.png)

### Interfaces

Instead of using `param: any` you can now use custom interfaces `param: UserDetails`. The interfaces files need to be located at `app/Interfaces/`

### Enums

If you use enums in your models, AutoSwagger will detect them from `app/Types/` folder and add them to the schema.
If you want to add enum on ExampleValue, you can use `.append(enumFieldExample)`

Example:

```ts
@AutoSwagger({
  responseBody: {
    200: '<Model>.with(relations).append(enumFieldExample)',
  },
})
```

## Extend Models

Add additional documentation to your Models properties.

### SoftDelete

Either use `compose(BaseModel, SoftDeletes)` or add a line `@swagger-softdeletes` to your Model.

## Attention

The below comments MUST be placed **1 line** above the property.

---

**@no-swagger**
Although, autoswagger detects `serializeAs: null` fields automatically, and does not show them. You can use @no-swagger for other fields.

You can also place `@no-swagger` directly above a model, interface, enum, type, or validator export to prevent that entity from being added to `components.schemas`.

**@enum(foo, bar)**
If a field has defined values, you can add them into an enum. This is usesfull for something like a status field.

**@format(string)**
Specify a format for that field, i.e. uuid, email, binary, etc...

**@example(foo bar)**
Use this field to provide own example values for specific fields

**@props({"minLength": 10, "foo": "bar"})**
Use this field to provide additional properties to a field, like minLength, maxLength, etc. Needs to bee valid JSON.

**@required**
Specify that the field is required

```ts
// @no-swagger
export default class InternalModel extends BaseModel {
  @column()
  public internalCode: string
}

// SomeModel.js
@hasMany(() => ProductView)
// @no-swagger
public views: HasMany<typeof ProductView>


@column()
// @enum(pending, active, deleted)
public status: string

@column()
// @example(johndoe@example.com)
public email: string

@column()
// @props({"minLength": 10})
public age: number

```

---

## Production environment

> [!WARNING]
> Make sure **NODE_ENV=production** in your production environment or whatever you set in `options.productionEnv`

To make it work in production environments, additional steps are required

- Create a new command for `docs:generate` [See official documentation](https://docs.adonisjs.com/guides/ace/creating-commands)
  - This should create a new file in `commands/DocsGenerate.ts`

- Use the provided [`DocsGenerate.ts.examle`](https://github.com/gabbrieu/adonis-autoswagger/blob/main/DocsGenerate.ts.example)/[`DocsGeneratev6.ts.example`](https://github.com/gabbrieu/adonis-autoswagger/blob/main/DocsGeneratev6.ts.example) and put its contents into your newly created `DocsGenerate.ts`

- Modify `/start/env.ts` as follows

```ts
//...
// this is necessary to make sure that the `DocsGenerate` command will run in CI/CD pipelines without setting environment variables
const isNodeAce = process.argv.some(
  (arg) => arg.endsWith("/ace") || arg === "ace"
);

export default await Env.create(
  new URL("../", import.meta.url),
  isNodeAce
    ? {}
    : {
        // leave other settings as is
        NODE_ENV: Env.schema.enum([
          "development",
          "production",
          "test",
        ] as const),
        PORT: Env.schema.number(),
      }
);

//...
```

- Execute the following

```bash
node ace docs:generate
node ace build --production
cp swagger.yml build/
```
