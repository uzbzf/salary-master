const BASE = 'http://localhost:3011/api/v1';

let token = null;

async function call(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 120);
  }
  return { status: res.status, data };
}

function show(label, r) {
  console.log(`${label} -> ${r.status}`, JSON.stringify(r.data).slice(0, 220));
}

const health = await fetch('http://localhost:3011/health').then((r) => r.json());
console.log('health ->', JSON.stringify(health));

const email = `t${Date.now()}@test.ru`;
show('register', await call('POST', '/auth/register', { email, name: 'Тест', password: 'pass12345' }));
const reg = await call('POST', '/auth/register', { email: `u${Date.now()}@test.ru`, name: 'Юзер2', password: 'pass12345' });
token = reg.data.token;
console.log('token acquired:', Boolean(token));

show('login', await call('POST', '/auth/login', { email, password: 'pass12345' }));
show('login wrong pass', await call('POST', '/auth/login', { email, password: 'nope' }));

const inc = await call('POST', '/incomes', { amount: 120000, date: '2026-10-01', category: 'salary', comment: 'зарплата' });
show('create income', inc);
const exp = await call('POST', '/expenses', { amount: 45000, date: '2026-10-02', category: 'food', comment: 'магазин', isRecurring: false });
show('create expense', exp);

const inc2 = await call('POST', '/incomes', { amount: 30000, date: '2026-09-15', category: 'freelance' });
show('create income 2', inc2);
const exp2 = await call('POST', '/expenses', { amount: 12000, date: '2026-09-20', category: 'transport', isRecurring: true });
show('create expense 2', exp2);

show('list incomes', await call('GET', '/incomes?page=1&limit=5'));
show('list expenses filtered', await call('GET', '/expenses?category=food'));
show('get income by id', await call('GET', `/incomes/${inc.data.data.id}`));
show('update income', await call('PUT', `/incomes/${inc.data.data.id}`, { amount: 130000, comment: 'повышение' }));
show('update expense isRecurring', await call('PUT', `/expenses/${exp.data.data.id}`, { isRecurring: true }));
show('balance', await call('GET', '/summary/balance'));
show('by-category expense', await call('GET', '/summary/by-category?type=expense'));
show('by-category income', await call('GET', '/summary/by-category?type=income'));
show('monthly', await call('GET', '/summary/monthly?months=6'));

const csv = await call('GET', '/export/csv');
console.log('export ->', csv.status, JSON.stringify(String(csv.data).slice(0, 160)));

show('validation: amount 0', await call('POST', '/expenses', { amount: 0, date: '2026-10-02', category: 'food' }));
show('validation: bad date', await call('POST', '/expenses', { amount: 10, date: '01.10.2026', category: 'food' }));
show('validation: bad category', await call('POST', '/expenses', { amount: 10, date: '2026-10-02', category: 'nope' }));

show('delete income 2', await call('DELETE', `/incomes/${inc2.data.data.id}`));
show('delete expense 2', await call('DELETE', `/expenses/${exp2.data.data.id}`));
show('delete missing', await call('DELETE', `/incomes/does-not-exist`));
show('no token', await call('GET', '/incomes'));

const saved = token;
token = null;
show('401 without token', await call('GET', '/incomes'));
token = saved;

show('404 route', await call('GET', '/nope'));
console.log('E2E DONE');