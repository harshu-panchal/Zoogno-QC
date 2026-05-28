# Reusable Engineering Skills

Long-lived patterns and methodologies. Consult these on every relevant PR;
they are evergreen and apply to all future work, not just one migration.

| Skill | Use when |
| --- | --- |
| `safe-refactor-strategy/` | Any non-trivial refactor — the master playbook (wrap & improve, < 5 min rollback). |
| `coupling-cohesion-audit/` | Periodic architecture review or "where should I start?" questions. |
| `domain-service-extraction/` | A controller or service grows past ~500 lines or 15 imports. Several controllers in this repo (`orderController.js` ~1300 lines, `deliveryController.js` ~770 lines) are still candidates. |
| `frontend-page-decomposition/` | A page JSX file exceeds ~300 lines / 15 KB. Many oversized pages remain (`ProductManagement.jsx` 80 KB, `Orders.jsx` 64 KB, `CheckoutPage.jsx` 43 KB, …). |
| `shared-hooks-library/` | Adding a new reusable hook (`useApiState`, `usePagination`, …). New hooks land under `frontend/src/shared/hooks/`. |
| `shared-ui-component-extraction/` | Promoting an inline UI primitive to `frontend/src/shared/components/ui/` — only after a second consumer exists. |
| `validation-middleware-standard/` | Any new HTTP endpoint or any controller still using inline `validateWithJoi(...)`. Schemas live under `app/validation/`. |
| `db-performance-hardening/` | Adding indexes (via `databaseIndexManager.js`), wrapping reads in `cacheService.getOrSet`, or propagating `correlationId`. |
| `modular-monolith-layout/` | Deciding where a new backend file goes — `domains/<entity>/` for business logic, `infrastructure/<kind>/` for plumbing. |
| `infrastructure-domain-separation/` | A domain service is about to import a vendor SDK or `getRedisClient()` directly — stop and wrap it in `infrastructure/`. |
| `provider-adapter-pattern/` | Adding a second payment / SMS / push provider, or wrapping a new SDK behind a port. |

## Reading order for new contributors

1. `safe-refactor-strategy/` — the philosophy
2. `modular-monolith-layout/` — where files go
3. `coupling-cohesion-audit/` — how to spot problems
4. Then dive into the specific skill that matches the task at hand.
