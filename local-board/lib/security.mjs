// 本地服务的请求校验。服务只监听 127.0.0.1，这里再防两类问题：
// 1. DNS 重绑定：恶意网站把自己的域名解析到 127.0.0.1 后访问本服务，此时 Host 头是对方的域名，直接拒绝；
// 2. 跨站写入：其他网页向本服务提交数据，写接口要求 Origin 必须是看板自己的地址，并且是 JSON 请求
//    （跨站表单无法发送 application/json，而 JSON 请求必须先过浏览器预检；本服务不返回任何 CORS 头，预检必然失败）。

export function allowedHosts(port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

export function isAllowedHost(host, port) {
  return typeof host === 'string' && allowedHosts(port).includes(host.toLowerCase());
}

export function isAllowedOrigin(origin, port) {
  return typeof origin === 'string' && allowedHosts(port).map((host) => `http://${host}`).includes(origin.toLowerCase());
}

export function isJsonRequest(contentType) {
  return typeof contentType === 'string' && contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/** 返回 null 表示通过；否则返回 [状态码, 中文原因]。 */
export function checkRequest({ method, headers }, port) {
  if (!isAllowedHost(headers.host, port)) return [421, '请求的地址不是本地看板'];
  if (method === 'GET' || method === 'HEAD') return null;
  if (!isAllowedOrigin(headers.origin, port)) return [403, '只接受看板页面自己发出的修改'];
  if (!isJsonRequest(headers['content-type'])) return [415, '只接受 JSON 请求'];
  return null;
}
