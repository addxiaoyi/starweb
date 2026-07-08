# API 响应封装约定（2026-04）

为保证前后端协议一致性，StarMC API 采用如下统一结构。

## 1) 成功响应

```json
{
  "ok": true,
  "success": true
}
```

业务字段直接平铺在根级（如 `item`、`items`、`message` 等）。

## 2) 错误响应

```json
{
  "ok": false,
  "success": false,
  "message": "可直接展示给用户的错误文案",
  "code": "machine_readable_code",
  "error": "machine_readable_code",
  "details": {}
}
```

- `message`：用户可读文案。
- `code/error`：机器可读错误码（两者保持一致，兼容旧前端）。
- `details`：可选附加字段（如 `attemptsLeft`、上下文等）。

## 3) 分页响应

分页接口必须同时返回旧字段与新字段：

```json
{
  "ok": true,
  "success": true,
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "pagination": {
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1,
    "hasMore": false,
    "hasPrev": false
  }
}
```

## 4) 兼容策略

- 新接口优先使用 `ok/success + code + pagination`。
- 旧接口在迁移期间保留 `items/total/page/pageSize` 与 `error` 字段。
- 前端统一使用 `parseApiError` 与 `normalizePagedResponse` 做适配。
