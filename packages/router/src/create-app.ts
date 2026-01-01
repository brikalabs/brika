import { Hono } from "hono";
import { cors } from "hono/cors";
import { inject as diInject } from "@elia/shared";
import { z, ZodError } from "zod";
import type { RouteDefinition, RouteContext, Schema } from "./types";
import { HttpException } from "./exceptions";

/**
 * CORS configuration for the API.
 */
const corsConfig = {
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
};

/**
 * Parse and validate request data against Zod schemas.
 */
async function parseRequest<S extends Schema>(
  req: Request,
  params: Record<string, string>,
  schema?: S,
): Promise<{ params: unknown; query: unknown; body: unknown }> {
  const url = new URL(req.url);

  // Parse query string into object
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  // Parse body if present
  let bodyData: unknown = undefined;
  if (req.method !== "GET" && req.method !== "DELETE") {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const text = await req.text();
      bodyData = text ? JSON.parse(text) : {};
    }
  }

  if (!schema) {
    return { params, query: queryObj, body: bodyData };
  }

  // Validate with Zod schemas
  const validatedParams = schema.params ? schema.params.parse(params) : params;
  const validatedQuery = schema.query ? schema.query.parse(queryObj) : queryObj;
  const validatedBody = schema.body ? schema.body.parse(bodyData) : bodyData;

  return {
    params: validatedParams,
    query: validatedQuery,
    body: validatedBody,
  };
}

/**
 * Format Zod validation errors into a structured object.
 * Uses Zod 4's flattenError for clean field-level errors.
 * @see https://zod.dev/error-formatting
 */
function formatZodError(error: ZodError): {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
} {
  // Use Zod 4's flattenError utility
  return z.flattenError(error);
}

/**
 * Create a Hono app from route definitions.
 *
 * @example
 * ```ts
 * const app = createApp([
 *   ...healthRoutes,
 *   ...userRoutes,
 *   ...postRoutes,
 * ]);
 *
 * Bun.serve({ fetch: app.fetch, port: 3000 });
 * ```
 */
export function createApp(routes: RouteDefinition[]): Hono {
  const app = new Hono();

  // Add CORS middleware
  app.use("*", cors(corsConfig));

  // Global error handler for uncaught errors
  app.onError((error, c) => {
    // Handle HTTP exceptions
    if (error instanceof HttpException) {
      return c.json({ error: error.message }, error.status);
    }

    // Handle Zod validation errors (check both instanceof and name for cross-package compatibility)
    if (error instanceof ZodError || (error as Error).name === "ZodError") {
      const formatted =
        error instanceof ZodError
          ? formatZodError(error)
          : { formErrors: [(error as Error).message], fieldErrors: {} };
      return c.json({ error: "Validation failed", ...formatted }, 400);
    }

    // Handle unexpected errors
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[router] Unhandled error:", error);
    return c.json({ error: errMsg }, 500);
  });

  // Register each route
  for (const routeDef of routes) {
    const method = routeDef.method.toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "patch"
      | "delete";

    app[method](routeDef.path, async (c) => {
      try {
        // Parse and validate request
        const { params, query, body } = await parseRequest(
          c.req.raw,
          c.req.param(),
          routeDef.schema,
        );

        // Build context with DI inject function
        const ctx: RouteContext = {
          params: params as Record<string, string>,
          query: query as Record<string, string>,
          body,
          inject: diInject,
          req: c.req.raw,
        };

        // Call handler
        const result = await routeDef.handler(ctx);

        // If handler returns a Response, use it directly (for SSE, file downloads, etc.)
        if (result instanceof Response) {
          return result;
        }

        // Return JSON response
        return c.json(result);
      } catch (error) {
        // Handle HTTP exceptions
        if (error instanceof HttpException) {
          return c.json({ error: error.message }, error.status);
        }

        // Handle Zod validation errors
        // Check both instanceof and error name/structure for cross-package compatibility
        const isZodError =
          error instanceof ZodError ||
          (error as Error).name === "ZodError" ||
          ((error as Record<string, unknown>).issues !== undefined &&
            Array.isArray((error as Record<string, unknown>).issues));

        if (isZodError) {
          // Use Zod 4's flattenError for structured field errors
          const formatted =
            error instanceof ZodError
              ? formatZodError(error)
              : { formErrors: [(error as Error).message], fieldErrors: {} };
          return c.json({ error: "Validation failed", ...formatted }, 400);
        }

        // Handle unexpected errors
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error("[router] Unhandled error:", error);
        return c.json({ error: errMsg }, 500);
      }
    });
  }

  return app;
}

