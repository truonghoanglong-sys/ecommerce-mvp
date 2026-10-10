/**
 * Chuyển JSON body (REST) → message gRPC có kiểu chặt chẽ.
 *
 * Vì sao cần? protobuf ép kiểu ngầm: gửi "score": "abc" vào field int32 sẽ thành 0
 * → có thể vô tình đặt điểm về 0. Nên Gateway kiểm tra KIỂU DỮ LIỆU trước khi gọi gRPC,
 * sai kiểu → 400 ngay. Kiểm tra NGHIỆP VỤ (độ dài, giá >= 0...) vẫn do service đảm nhiệm.
 *
 * schema: { tênField: { type: 'string' | 'number' | 'int' | 'items', required?: true } }
 * mode 'patch': cập nhật một phần → sinh thêm update_mask = các field client thực sự gửi.
 */
const TYPE_CHECK = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  int: (v) => Number.isInteger(v),
  items: (v) => Array.isArray(v) && v.every((i) => i && typeof i === 'object' && Number.isInteger(i.pid) && Number.isInteger(i.qty)),
};
const TYPE_NAME = { string: 'a string', number: 'a number', int: 'an integer', items: 'an array of {pid, qty} integers' };

class RequestError extends Error {}

function mapBody(body, schema, mode = 'create') {
  if (body === undefined || body === null) body = {};
  if (typeof body !== 'object' || Array.isArray(body)) throw new RequestError('request body must be a JSON object');

  const unknown = Object.keys(body).filter((k) => !(k in schema));
  if (unknown.length) throw new RequestError(`unknown field(s): ${unknown.join(', ')}`);

  const message = {};
  const mask = [];
  for (const [field, rule] of Object.entries(schema)) {
    const value = body[field];
    if (value === undefined || value === null) {
      if (rule.required && mode === 'create') throw new RequestError(`${field} is required`);
      continue;
    }
    if (!TYPE_CHECK[rule.type](value)) throw new RequestError(`${field} must be ${TYPE_NAME[rule.type]}`);
    message[field] = rule.type === 'items' ? value.map(({ pid, qty }) => ({ pid, qty })) : value;
    mask.push(field);
  }
  if (mode === 'patch') message.update_mask = mask;
  return message;
}

// Tham số trên URL (:uid, :pid...) phải là số nguyên dương
function intParam(params, name) {
  const n = Number(params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new RequestError(`${name} must be a positive integer`);
  return n;
}

module.exports = { mapBody, intParam, RequestError };
