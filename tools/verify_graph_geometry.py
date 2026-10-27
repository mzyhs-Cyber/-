"""几何核验基础函数。私密题图及题目坐标由调用者保管，不写入仓库。

exact_cover: 单位格拼合，只允许平移和90度旋转，不允许镜像。
cube_vertex_sums: 正方体展开图转为法向，枚举八个顶点。
输入转录仍须逐图人工核对；本模块不处理任意角度双面纸片。
"""
from itertools import product


def _normalize(cells):
    x0 = min(x for x, _ in cells)
    y0 = min(y for _, y in cells)
    return frozenset((x - x0, y - y0) for x, y in cells)


def _rotations(cells):
    result = set()
    for _ in range(4):
        result.add(_normalize(cells))
        cells = {(y, -x) for x, y in cells}
    return result


def exact_cover(target, pieces):
    """返回一个合法覆盖；无覆盖返回None。传入非空单位格集合。"""
    if not target or any(not piece for piece in pieces):
        raise ValueError('target and pieces must be nonempty')
    if sum(map(len, pieces)) != len(target):
        return None
    target = set(_normalize(target))
    width = max(x for x, _ in target) + 1
    height = max(y for _, y in target) + 1

    def search(left, index):
        if index == len(pieces):
            return [] if not left else None
        for shape in _rotations(pieces[index]):
            for dx in range(width):
                for dy in range(height):
                    placed = {(x + dx, y + dy) for x, y in shape}
                    if placed <= left:
                        rest = search(left - placed, index + 1)
                        if rest is not None:
                            return [placed] + rest
        return None

    return search(target, 0)


def cube_vertex_sums(net):
    """net={(x,y):数字}；验证可折成正方体，返回八组三面与和。"""
    if len(net) != 6:
        raise ValueError('a cube requires six faces')
    neg = lambda v: tuple(-a for a in v)
    first = next(iter(net))
    orientation = {first: ((1, 0, 0), (0, 1, 0), (0, 0, 1))}
    queue = [first]
    while queue:
        x, y = queue.pop()
        u, v, n = orientation[(x, y)]
        moves = [(1, 0, (neg(n), v, u)), (-1, 0, (n, v, neg(u))),
                 (0, 1, (u, neg(n), v)), (0, -1, (u, n, neg(v)))]
        for dx, dy, new in moves:
            nxt = (x + dx, y + dy)
            if nxt not in net:
                continue
            if nxt in orientation:
                if orientation[nxt] != new:
                    raise ValueError('inconsistent fold')
            else:
                orientation[nxt] = new
                queue.append(nxt)
    if len(orientation) != 6 or len({o[2] for o in orientation.values()}) != 6:
        raise ValueError('disconnected or overlapping cube net')
    result = []
    for vertex in product((-1, 1), repeat=3):
        faces = [net[k] for k, (_, _, n) in orientation.items()
                 if sum(a * b for a, b in zip(n, vertex)) == 1]
        if len(faces) != 3:
            raise ValueError('invalid cube vertex')
        result.append((faces, sum(faces)))
    return result
