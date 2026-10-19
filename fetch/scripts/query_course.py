#!/usr/bin/env python3
"""标准库即可运行：python query_course.py 金融计量学 --type plan"""
import argparse
import getpass
import html
import json
import os
import sys
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

BASE = 'https://jwxt.zuel.edu.cn'
ENDPOINTS = {'public': 'yl_xsxkGgxxkxk', 'cross': 'yl_xsxkFawxk',
             'plan': 'yl_xsxkBxqjhxk'}
FIELDS = [('kcmc', '课程名称'), ('kch', '课程编号'), ('kexuhao', '课序号'),
          ('skls', '教师'), ('xf', '学分'), ('zxs', '学时'), ('sksj', '上课时间'),
          ('skdd', '上课地点'), ('xqmc', '校区'), ('xkrs', '已选人数'),
          ('xxrs', '人数上限'), ('syrs', '剩余名额'), ('pkrs', '排课人数'),
          ('khfs', '考核方式'), ('dwmc', '开课单位'), ('ktmc', '班级'),
          ('kcxzmc', '课程性质'), ('szkcflmc', '课程分类'),
          ('xnxq01id', '学期'), ('xkzt', '选课状态码'), ('ctsm', '冲突说明'),
          ('jx0404id', '教学班ID')]

class SameOriginRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 避免将会话凭据转发至其他站点或明文连接。
        if urlsplit(newurl)[:2] != urlsplit(BASE)[:2]:
            raise RuntimeError('服务器跳转至其他站点，请更新 Cookie 后重试。')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def make_url(args):
    params = {'kcxx': quote(args.course, safe=''), 'skls': quote(args.teacher, safe=''),
              'skxq': args.weekday or '', 'skjc': args.start or '', 'endJc': args.end or '',
              'sfym': args.sfym, 'sfct': args.sfct, 'sfxx': args.sfxx}
    if args.type == 'public':
        params['szjylb'] = args.szjylb
    elif args.type == 'cross':
        params['kkdw'] = args.kkdw
    else:
        params['skfs'] = args.skfs
    # urlencode 再编码一次百分号，保持 kcxx 的双重百分号编码。
    return BASE + '/jsxsd/xsxkkc/' + ENDPOINTS[args.type] + '?' + urlencode(params)

def query(url, cookie):
    opener = build_opener(SameOriginRedirect())
    rows, start, total = [], 0, None
    seen = set()
    while True:
        req = Request(url, data=urlencode({'sEcho': 1, 'iDisplayStart': start,
                      'iDisplayLength': 100}).encode(), headers={
                      'Cookie': cookie, 'X-Requested-With': 'XMLHttpRequest'})
        with opener.open(req, timeout=30) as response:
            body = response.read().decode('utf-8-sig')
        try:
            payload = json.loads(body)
        except ValueError:
            raise RuntimeError('接口未返回 JSON；可能是 Cookie 失效或选课页面不可用。') from None
        if not isinstance(payload, dict) or not isinstance(payload.get('aaData'), list):
            raise RuntimeError('接口响应格式异常，未取得课程列表。')
        batch = payload['aaData']
        count = int(payload.get('iTotalDisplayRecords', payload.get('iTotalRecords', -1)))
        if count < 0 or any(not isinstance(row, dict) for row in batch):
            raise RuntimeError('接口记录数或课程数据格式异常。')
        if total is not None and count != total:
            raise RuntimeError('分页期间记录总数发生变化，请重新查询。')
        total = count
        fingerprint = json.dumps(batch, sort_keys=True, ensure_ascii=False)
        if batch and fingerprint in seen:
            raise RuntimeError('接口重复返回同一页，停止以避免遗漏或死循环。')
        seen.add(fingerprint)
        rows.extend(batch)
        start += len(batch)
        if start == total:
            return rows
        if not batch or start > total:
            raise RuntimeError('分页记录数与接口总数不一致。')

def cell(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return html.unescape(str(value)).replace('\r', '').replace('\n', ' / ').replace('\t', ' ')

def width(text):
    return sum(0 if unicodedata.combining(c) else 2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in text)

def table(headers, records):
    values = [[cell(v) for v in row] for row in [headers] + records]
    widths = [max(width(row[i]) for row in values) for i in range(len(headers))]
    def line(row):
        return '| ' + ' | '.join(v + ' ' * (w - width(v)) for v, w in zip(row, widths)) + ' |'
    print(line(values[0]))
    print('|' + '|'.join('-' * (w + 2) for w in widths) + '|')
    for row in values[1:]:
        print(line(row))

def main():
    parser = argparse.ArgumentParser(description='只读查询课程并输出全部教学班；无需安装第三方库。')
    parser.add_argument('course', nargs='?', help='课程名称或编号；省略则运行时输入')
    parser.add_argument('--type', choices=ENDPOINTS, default='plan', help='plan=计划内（默认），public=公选，cross=跨专业')
    parser.add_argument('--teacher', default='', help='上课教师')
    parser.add_argument('--weekday', type=int, choices=range(1, 8), help='星期1至7')
    parser.add_argument('--start', type=int, help='开始节次')
    parser.add_argument('--end', type=int, help='结束节次，须与开始节次一起设置')
    for key, default, desc in [('sfym', 'false', '过滤已满课程'), ('sfct', 'false', '过滤冲突课程'), ('sfxx', 'true', '过滤限选课程')]:
        parser.add_argument('--' + key, choices=['true', 'false'], default=default, help=desc + '，默认' + default)
    parser.add_argument('--szjylb', default='', help='公选课专有参数，含义尚未核实，原样传入')
    parser.add_argument('--kkdw', default='', help='跨专业开课单位代码')
    parser.add_argument('--skfs', default='', help='计划内授课方式代码')
    parser.add_argument('--all-fields', action='store_true', help='追加每个教学班的全部原始字段表，包括嵌套排课信息')
    args = parser.parse_args()
    args.course = (args.course or input('课程名称或编号：')).strip()
    if not args.course:
        parser.error('课程名称不能为空。')
    if (args.start is None) != (args.end is None) or (args.start is not None and not 1 <= args.start <= args.end):
        parser.error('开始和结束节次须同时提供，且满足1 <= 开始 <= 结束。')
    cookie = os.environ.get('ZUEL_COOKIE', '').strip() or getpass.getpass('Cookie（输入不回显）：').strip()
    if not cookie:
        parser.error('Cookie 不能为空。')
    rows = query(make_url(args), cookie)
    print(f'查询：{args.course} | 接口：{ENDPOINTS[args.type]} | 教学班：{len(rows)} 条')
    if not rows:
        print('当前会话和筛选条件下未返回记录；不代表学校未开设该课程。')
        return
    table([label for _, label in FIELDS], [[r.get(key) for key, _ in FIELDS] for r in rows])
    print('状态码：9=已选，0=未选；课程名称可能为模糊匹配。人数是查询时快照。')
    if args.all_fields:
        for i, row in enumerate(rows, 1):
            print(f'\n教学班 {i}：全部原始字段')
            table(['字段', '值'], [[k, v] for k, v in row.items()])

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except (RuntimeError, HTTPError, URLError, TimeoutError, UnicodeError, ValueError) as exc:
        print(f'查询失败：{exc}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
