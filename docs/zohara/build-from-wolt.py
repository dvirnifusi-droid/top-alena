# -*- coding: utf-8 -*-
"""Turn Wolt's venue menu payload into an import-ready file.

Source: restaurant-api.wolt.com/v4/venues/<venueId>/menu — the public consumer
endpoint. It answers on the venue ID and 404s on the slug, which is why every
earlier attempt failed; the ID came out of the merchant URL the owner sent.

Two things about the shape, both of which cost a pass to discover:
  * money is in agorot;
  * an item's `options` entries are group HEADERS (id, name, min/max) with no
    values. The actual choices live in a separate top-level `options` array,
    joined by id. Reading only the item gave 122 groups and zero values.
"""
import io, json, os

SRC = os.path.join(os.path.dirname(__file__), 'zohara_api.json')
OUT = r"C:\Users\97253\TOP ALENA\docs\zohara\zohara-wolt-menu.json"

d = json.load(io.open(SRC, encoding='utf-8'))
cats = {c['id']: c.get('name') for c in d.get('categories', [])}
opt_by_id = {o['id']: o for o in d.get('options', [])}

def money(v):
    return None if v is None else round(v / 100.0, 2)

def clean(s):
    return (s or '').replace('\u202b', '').replace('\u202c', '').strip()

dishes = []
for it in d.get('items', []):
    groups = []
    for g in it.get('options') or []:
        # Join on parent, NOT id: the entry on the item is a per-dish override
        # (its own id, its own min/max) and `parent` points at the shared option
        # definition that actually holds the values. Joining on id matched
        # nothing and produced 122 groups with no choices in them.
        full = opt_by_id.get(g.get('parent')) or opt_by_id.get(g.get('id')) or {}
        values = []
        for v in full.get('values') or []:
            values.append({
                'name': clean(v.get('name')),
                'price': money(v.get('price')) or 0,
                'default': bool(v.get('default')),
                'enabled': v.get('enabled', True),
            })
        groups.append({
            'name': clean(g.get('name') or full.get('name')),
            'type': full.get('type'),
            'min': g.get('minimum_total_selections'),
            'max': g.get('maximum_total_selections'),
            'free': g.get('free_selections') or 0,
            'values': values,
        })

    dishes.append({
        'wolt_id': it.get('id'),
        'name': clean(it.get('name')),
        'price': money(it.get('baseprice')),
        'desc': clean(it.get('description')).replace('\n', ' '),
        'category': cats.get(it.get('category')),
        'image': it.get('image'),
        'enabled': it.get('enabled', True),
        # Wolt stores this multiplied by 10 (50 means 5.0%).
        'alcohol_pct': (it.get('alcohol_percentage') or 0) / 10.0,
        'option_groups': groups,
    })

dishes.sort(key=lambda x: (x['category'] or '', -(x['price'] or 0)))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, 'w', encoding='utf-8').write(json.dumps({
    'source': 'restaurant-api.wolt.com/v4/venues/69663638804b01e87f922dd8/menu',
    'venue': 'חומוס זוהרה',
    'categories': [c for c in cats.values() if c],
    'dishes': dishes,
}, ensure_ascii=False, indent=1))

gtot = sum(len(x['option_groups']) for x in dishes)
vtot = sum(len(g['values']) for x in dishes for g in x['option_groups'])
print('dishes:', len(dishes))
print('categories:', len([c for c in cats.values() if c]))
print('descriptions:', sum(1 for x in dishes if x['desc']))
print('images:', sum(1 for x in dishes if x['image']))
print('option groups:', gtot, '| option values:', vtot)
print('required groups (min>=1):', sum(1 for x in dishes for g in x['option_groups'] if (g['min'] or 0) >= 1))
print('paid options:', sum(1 for x in dishes for g in x['option_groups'] for v in g['values'] if v['price']))
print()
s = next(x for x in dishes if x['option_groups'] and x['option_groups'][0]['values'])
print('example —', s['name'], s['price'])
for g in s['option_groups'][:3]:
    print('  [{}]  min={} max={}'.format(g['name'], g['min'], g['max']))
    for v in g['values'][:5]:
        print('     -', v['name'], ('+%s' % v['price']) if v['price'] else '')
