#!/usr/bin/env python3
"""Instantiate the Python ontology with a Python file: the A-box extractor.

Parses the file with the `ast` module (the file is NEVER executed) and emits
RDF individuals described by the py: vocabulary:

- the file as a py:Module (instance of ModuleType)
- module-level functions as py:Callable (instances of FunctionType)
- module-level constants as py:Value (instances of their static type where
  resolvable)
- imports resolved by safe introspection of standard-library modules only
  (guarded by sys.stdlib_module_names); imported entities become nodes with
  full tower/lattice edges
- py:definedIn edges from every definition to its module
- py:calls edges: the static call graph, including the module entry point

Output: data/ontologies/<file-stem>.ttl (loaded by the Colibri drop zone,
provenance = file stem).

Usage: .venv/bin/python src/extract_python_file.py <file.py> [...]
"""

import ast
import builtins
import json
import sys
import types as types_mod
from pathlib import Path

from rdflib import Graph, Literal, Namespace, RDF, RDFS, URIRef

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_python as pyx  # noqa: E402 - reuse its node table and helpers

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "ontologies"

PY = Namespace("https://colibri.example/ns/py#")
FILE_NS = "https://colibri.example/data/python/file/"

# IRI map of the introspected builtins/types (builtins table from the T-box)
IRI_MAP = pyx.collect_nodes()

# typing aliases: annotation-only stand-ins for real types
TYPING_ALIASES = {"Dict": "dict", "List": "list", "Tuple": "tuple",
                  "Set": "set", "FrozenSet": "frozenset",
                  "Optional": "the class or None", "Union": "either class"}

# known safe return types for stdlib calls we cannot resolve statically
KNOWN_RETURNS = [(("re", "compile"), ("re", "Pattern"))]


def ensure(g: Graph, obj) -> str | None:
    """Emit obj (and its tower/lattice closure) if not already in the map.
    Returns its IRI, or None for things that cannot be named."""
    if obj in IRI_MAP:
        return IRI_MAP[obj]
    if isinstance(obj, types_mod.ModuleType):
        name = getattr(obj, "__name__", None)
        if not name:
            return None
        iri = FILE_NS + "module/" + pyx.slug(name)
        IRI_MAP[obj] = iri
        g.add((URIRef(iri), RDF.type, PY.Module))
        g.add((URIRef(iri), PY.towerLevel, Literal(0)))
        g.add((URIRef(iri), RDFS.label, Literal(name)))
        modtype = _module_type_iri(g)
        if modtype:
            g.add((URIRef(iri), PY.instanceOf, URIRef(modtype)))
        return iri
    name = getattr(obj, "__name__", None)
    if name is None:
        return None
    if getattr(obj, "__module__", "") == "typing" and name in TYPING_ALIASES:
        iri = FILE_NS + "type/" + pyx.slug(name) + "-alias"
        IRI_MAP[obj] = iri
        g.add((URIRef(iri), RDF.type, PY.Type))
        g.add((URIRef(iri), PY.towerLevel, Literal(1)))
        g.add((URIRef(iri), RDFS.label, Literal(f"{name} (typing alias)")))
        g.add((URIRef(iri), RDFS.comment,
               Literal(f"typing alias for {TYPING_ALIASES[name]} - "
                       "annotation-only, no runtime class. The invariant "
                       "that flags this node is deliberate: it catches "
                       "the convenience fiction that typing aliases are "
                       "real classes.")))
        return iri
    if isinstance(obj, type) or callable(obj):
        kind = pyx.node_type(obj)
        group = "type" if isinstance(obj, type) else "callable"
        iri = FILE_NS + group + "/" + pyx.slug(name)
        IRI_MAP[obj] = iri
        s = URIRef(iri)
        g.add((s, RDF.type, kind))
        g.add((s, PY.towerLevel, Literal(pyx.tower_level(obj))))
        g.add((s, RDFS.label, Literal(name)))
        desc = pyx.doc_first_line(obj)
        if desc:
            g.add((s, RDFS.comment, Literal(desc)))
        cls = getattr(obj, "__class__", None)
        cls_iri = ensure(g, cls) if cls is not None else None
        if cls_iri:
            g.add((s, PY.instanceOf, URIRef(cls_iri)))
        # anchor to the defining module (compile -> re, DictReader -> csv)
        mod = sys.modules.get(getattr(obj, "__module__", "") or "")
        if isinstance(mod, types_mod.ModuleType):
            mod_iri = ensure(g, mod)
            if mod_iri:
                g.add((s, PY.definedIn, URIRef(mod_iri)))
        if isinstance(obj, type):
            for base in getattr(obj, "__bases__", ()):
                base_iri = ensure(g, base)
                if base_iri:
                    g.add((s, PY.subclassOf, URIRef(base_iri)))
            for a, b in zip(obj.__mro__, obj.__mro__[1:]):
                a_iri, b_iri = ensure(g, a), ensure(g, b)
                if a_iri and b_iri:
                    g.add((URIRef(a_iri), PY.mroNext, URIRef(b_iri)))
            meta = type(obj)
            if meta is not type:
                meta_iri = ensure(g, meta)
                if meta_iri:
                    g.add((s, PY.metaclassOf, URIRef(meta_iri)))
        return iri
    return None


def _module_type_iri(g: Graph):
    if types_mod.ModuleType in IRI_MAP:
        return IRI_MAP[types_mod.ModuleType]
    return None


def doc_of(node) -> str:
    doc = ast.get_docstring(node)
    if doc:
        return doc.strip().splitlines()[0][:300]
    return ""


def extract_file(path: Path, g: Graph):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    stem = path.stem
    module_iri = FILE_NS + pyx.slug(stem) + "/module"

    g.add((URIRef(module_iri), RDF.type, PY.Module))
    g.add((URIRef(module_iri), PY.towerLevel, Literal(0)))
    g.add((URIRef(module_iri), RDFS.label, Literal(stem)))
    doc = doc_of(tree)
    if doc:
        g.add((URIRef(module_iri), RDFS.comment, Literal(doc)))
    modtype = _module_type_iri(g)
    if modtype:
        g.add((URIRef(module_iri), PY.instanceOf, URIRef(modtype)))

    bindings = {}      # name -> iri, for call resolution
    bindings_obj = {}  # name -> python object, for constructor typing
    value_types = {}   # name -> type object, for operator-chain propagation
    modules = {}       # alias -> module object
    calls = set()      # (caller_iri, callee_iri)
    func_defs = {}     # fname -> ast.FunctionDef, for the flow layer
    func_iris = {}     # fname -> iri, for the flow layer

    def resolve_call(func) -> str | None:
        if isinstance(func, ast.Name):
            if func.id in bindings:
                return bindings[func.id]
            obj = getattr(builtins, func.id, None)
            if obj is not None and obj in IRI_MAP:
                return IRI_MAP[obj]
            if obj is not None:
                return ensure(g, obj)
            return None
        if (isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Name)
                and func.value.id in modules):
            mod = modules[func.value.id]
            obj = getattr(mod, func.attr, None)
            if obj is None:
                return None
            ensure(g, mod)
            return ensure(g, obj)
        return None

    def collect_calls(owner_iri, node):
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call):
                callee = resolve_call(sub.func)
                if callee and callee != owner_iri:
                    calls.add((owner_iri, callee))

    def emit_value(var, value_node, comment=""):
        iri = FILE_NS + pyx.slug(stem) + "/value/" + pyx.slug(var)
        s = URIRef(iri)
        g.add((s, RDF.type, PY.Value))
        g.add((s, PY.towerLevel, Literal(0)))
        g.add((s, RDFS.label, Literal(var)))
        g.add((s, PY.definedIn, URIRef(module_iri)))
        if comment:
            g.add((s, RDFS.comment, Literal(comment[:300])))
        bindings[var] = iri
        return s

    def static_type_of(value_node, value_types):
        """Best-effort static type resolution for module-level assignments.
        Returns the type OBJECT (or None); ensure() converts it to an IRI."""
        if isinstance(value_node, ast.Constant):
            return type(value_node.value)
        if isinstance(value_node, ast.Call):
            callee = resolve_call(value_node.func)
            if callee:
                for (m, fn), (rm, rn) in KNOWN_RETURNS:
                    if callee == FILE_NS + "callable/" + pyx.slug(fn) \
                       and rm in sys.modules:
                        target = getattr(sys.modules.get(m), rn, None)
                        if target is not None:
                            return target
            if isinstance(value_node.func, ast.Name):
                obj = bindings_obj.get(value_node.func.id)
                if isinstance(obj, type):
                    return obj
        # constructor used anywhere inside a chained expression
        # (Path(__file__).resolve().parent.parent is still a Path)
        for sub in ast.walk(value_node):
            if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name):
                obj = bindings_obj.get(sub.func.id)
                if isinstance(obj, type):
                    return obj
        # operator chains propagate the typed operand (BASE_DIR / ... is a Path)
        if isinstance(value_node, ast.BinOp):
            for side in (value_node.left, value_node.right):
                if isinstance(side, ast.Name) and side.id in value_types:
                    if value_types[side.id] is not None:
                        return value_types[side.id]
                if isinstance(side, ast.BinOp):
                    r = static_type_of(side, value_types)
                    if r is not None:
                        return r
        return None

    for stmt in tree.body:
        if isinstance(stmt, (ast.Import, ast.ImportFrom)):
            names = []
            if isinstance(stmt, ast.Import):
                for alias in stmt.names:
                    modname = alias.name
                    if modname in sys.stdlib_module_names:
                        import importlib
                        mod = importlib.import_module(modname)
                        if alias.asname:
                            modules[alias.asname] = mod
                            ensure(g, mod)
                            bindings[alias.asname] = IRI_MAP[mod]
                        else:
                            top = modname.split(".")[0]
                            modules[top] = sys.modules.get(top) or mod
                            ensure(g, sys.modules[top])
                            bindings[top] = IRI_MAP[sys.modules[top]]
            else:  # ImportFrom
                if stmt.module in sys.stdlib_module_names:
                    import importlib
                    mod = importlib.import_module(stmt.module)
                    ensure(g, mod)
                    for alias in stmt.names:
                        obj = getattr(mod, alias.name, None)
                        if obj is None:
                            continue
                        iri = ensure(g, obj)
                        if iri:
                            name = alias.asname or alias.name
                            bindings[name] = iri
                            bindings_obj[name] = obj
            continue

        if isinstance(stmt, ast.FunctionDef):
            fname = stmt.name
            iri = FILE_NS + "callable/" + pyx.slug(fname)
            s = URIRef(iri)
            g.add((s, RDF.type, PY.Callable))
            g.add((s, PY.towerLevel, Literal(0)))
            g.add((s, RDFS.label, Literal(fname)))
            g.add((s, PY.definedIn, URIRef(module_iri)))
            doc = doc_of(stmt)
            if doc:
                g.add((s, RDFS.comment, Literal(doc)))
            ftype = _function_type_iri(g)
            if ftype:
                g.add((s, PY.instanceOf, URIRef(ftype)))
            bindings[fname] = iri
            func_defs[fname] = stmt
            func_iris[fname] = iri
            collect_calls(iri, stmt)
            continue

        if isinstance(stmt, ast.Assign):
            for target in stmt.targets:
                if isinstance(target, ast.Name):
                    var = target.id
                    comment = ast.unparse(stmt.value)[:200] if hasattr(ast, "unparse") else ""
                    s = emit_value(var, stmt.value, comment)
                    type_obj = static_type_of(stmt.value, value_types)
                    if type_obj is not None:
                        type_iri = ensure(g, type_obj)
                        if type_iri:
                            g.add((s, PY.instanceOf, URIRef(type_iri)))
                    value_types[var] = type_obj
            # calls in the RHS of module-level assignments
            collect_calls(module_iri, stmt)
            continue

        # any other module-level statement: collect its calls only
        collect_calls(module_iri, stmt)

    for caller, callee in sorted(calls):
        g.add((URIRef(caller), PY.calls, URIRef(callee)))

    flow = extract_flow(tree, module_iri, stem, bindings, modules,
                       func_defs, func_iris)
    return module_iri, flow


def extract_flow(tree, module_iri, stem, bindings, modules,
                 func_defs, func_iris):
    """The data-flow layer: main()'s value chain, static, graph-native.

    Emits a plain JSON fragment (no RDF): local variables of main() as
    Variable nodes, flowIn/flowOut/binds links between values, variables
    and callables, and an ordered stage list (the execution replay) that
    the renderer plays with the Run button. The file is never executed;
    everything here is read off the AST.
    """
    # every IRI this file's extraction can legitimately reference
    known = (set(IRI_MAP.values()) | set(bindings.values())
             | set(func_iris.values()) | {module_iri})

    def known_iri(iri):
        return iri is not None and (iri in known or iri in var_nodes)

    def resolve_name(name, var_iris):
        if name in var_iris:
            return var_iris[name]
        if name in bindings:
            return bindings[name]
        obj = getattr(builtins, name, None)
        if obj is not None and obj in IRI_MAP:
            return IRI_MAP[obj]
        return None

    # output channels: which function parameters get written to
    # (write_csv opens its `path` parameter for writing)
    write_channels = {}
    for fname, fdef in func_defs.items():
        params = [a.arg for a in fdef.args.args]
        chans = set()
        for node in ast.walk(fdef):
            if not isinstance(node, ast.Call):
                continue
            target = mode = None
            if (isinstance(node.func, ast.Attribute)
                    and node.func.attr == "open"
                    and isinstance(node.func.value, ast.Name)):
                target = node.func.value.id
                for a in node.args:
                    if isinstance(a, ast.Constant) and isinstance(a.value, str):
                        mode = a.value
                        break
            elif (isinstance(node.func, ast.Name) and node.func.id == "open"
                    and node.args and isinstance(node.args[0], ast.Name)):
                target = node.args[0].id
                for a in node.args[1:]:
                    if isinstance(a, ast.Constant) and isinstance(a.value, str):
                        mode = a.value
                        break
            if target in params and mode and any(m in mode for m in "wax+"):
                chans.add(target)
        if chans:
            write_channels[fname] = chans

    var_nodes = {}   # iri -> node dict
    var_iris = {}    # name -> iri
    flow_links = []
    seen_links = set()

    def add_link(s, t, ty):
        if not s or not t or s == t or (s, t, ty) in seen_links:
            return
        seen_links.add((s, t, ty))
        flow_links.append({"source": s, "target": t, "type": ty})

    def new_var(name):
        if name in var_iris:
            return var_iris[name]
        iri = FILE_NS + pyx.slug(stem) + "/variable/" + pyx.slug(name)
        var_iris[name] = iri
        var_nodes[iri] = {
            "id": iri, "kind": "Variable", "name": name,
            "provenance": pyx.slug(stem),
            "description": f"local variable of main() in {stem}.py",
            "val": 1,
        }
        add_link(iri, module_iri, "definedIn")
        return iri

    stages = []

    def stage(id_, label, dur=1.4):
        st = {"id": id_, "label": label, "dur": dur, "pulse": False,
              "pulseNode": None, "edges": [], "glow": []}
        stages.append(st)
        return st

    def st_edge(st, s, t, ty):
        add_link(s, t, ty)
        if s and t:
            st["edges"].append([s, t])

    def st_glow(st, iris):
        for i in iris:
            if i and i not in st["glow"]:
                st["glow"].append(i)

    def label_of(node):
        try:
            return ast.unparse(node)[:70]
        except Exception:
            return ""

    def outer_call(node):
        if isinstance(node, ast.Call):
            return node
        for child in ast.iter_child_nodes(node):
            r = outer_call(child)
            if r is not None:
                return r
        return None

    def flowin_names(st, callee, expr):
        """flowIn edges from every resolvable Name in expr to callee."""
        for sub in ast.walk(expr):
            if isinstance(sub, ast.Name):
                iri = resolve_name(sub.id, var_iris)
                if iri and known_iri(iri) and iri != callee:
                    st_edge(st, iri, callee, "flowIn")

    fname_by_iri = {iri: f for f, iri in func_iris.items()}

    def walk_body(stmts):
        for stmt in stmts:
            if isinstance(stmt, ast.With):
                for item in stmt.items:
                    call = item.context_expr
                    if not isinstance(call, ast.Call):
                        continue
                    callee = resolve_call_flow(call.func)
                    if not callee or not known_iri(callee):
                        continue
                    st = stage(callee, label_of(call), 1.5)
                    flowin_names(st, callee, call)
                    if isinstance(item.optional_vars, ast.Name):
                        v = new_var(item.optional_vars.id)
                        st_edge(st, callee, v, "flowOut")
                        st_glow(st, [callee, v])
                walk_body(stmt.body)

            elif isinstance(stmt, ast.Assign):
                walk_assign(stmt)

            elif isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
                walk_call_stmt(stmt.value)

            elif isinstance(stmt, ast.For):
                walk_for(stmt)

            elif isinstance(stmt, ast.If):
                walk_body(stmt.body)
                walk_body(stmt.orelse)

            # AugAssign, Return, Pass: no value flowing worth a stage

    def target_names(targets):
        names = []
        for t in targets:
            for sub in ast.walk(t):
                if isinstance(sub, ast.Name):
                    names.append(sub.id)
        return names

    def walk_assign(stmt):
        tnames = target_names(stmt.targets)
        call = outer_call(stmt.value)
        callee = resolve_call_flow(call.func) if call is not None else None
        if callee and known_iri(callee):
            st = stage(callee, label_of(stmt), 1.5)
            for a in call.args:
                if isinstance(a, ast.Name):
                    iri = resolve_name(a.id, var_iris)
                    if iri and known_iri(iri) and iri != callee:
                        st_edge(st, iri, callee, "flowIn")
            outs = []
            for t in tnames:
                v = new_var(t)
                st_edge(st, callee, v, "flowOut")
                outs.append(v)
            st_glow(st, [callee] + outs)
            return
        # unresolved producer (row.get, item access): bind from what it reads
        reads = []
        for sub in ast.walk(stmt.value):
            if isinstance(sub, ast.Name):
                iri = resolve_name(sub.id, var_iris)
                if iri and known_iri(iri) and iri not in reads:
                    reads.append(iri)
        if reads:
            st = stage(reads[0], label_of(stmt), 1.2)
            for t in tnames:
                v = new_var(t)
                st_edge(st, reads[0], v, "binds")
                st_glow(st, [reads[0], v])

    def walk_call_stmt(call):
        callee = resolve_call_flow(call.func)
        if not callee or not known_iri(callee):
            return
        st = stage(callee, label_of(call), 1.1)
        flowin_names(st, callee, call)
        # a file function writing to one of its parameters produces output
        fname = fname_by_iri.get(callee)
        if fname and fname in write_channels:
            params = [a.arg for a in func_defs[fname].args.args]
            for i, a in enumerate(call.args):
                if i >= len(params) or params[i] not in write_channels[fname]:
                    continue
                if isinstance(a, ast.Name):
                    out_iri = resolve_name(a.id, var_iris)
                    if out_iri and known_iri(out_iri):
                        st_edge(st, callee, out_iri, "flowOut")
                        st["pulse"] = True
                        st["pulseNode"] = out_iri
                        st_glow(st, [out_iri])

    def walk_for(stmt):
        tnames = [sub.id for sub in ast.walk(stmt.target)
                  if isinstance(sub, ast.Name)]
        iter_ = stmt.iter
        if isinstance(iter_, ast.Call):
            callee = resolve_call_flow(iter_.func)
            if callee and known_iri(callee):
                st = stage(callee, label_of(stmt), 1.3)
                flowin_names(st, callee, iter_)
                for t in tnames:
                    v = new_var(t)
                    st_edge(st, callee, v, "binds")
                st_glow(st, [callee])
        elif isinstance(iter_, ast.Name):
            iri = resolve_name(iter_.id, var_iris)
            if iri and known_iri(iri):
                st = stage(iri, label_of(stmt), 1.2)
                for t in tnames:
                    v = new_var(t)
                    st_edge(st, iri, v, "binds")
                    st_glow(st, [iri, v])
        walk_body(stmt.body)

    def resolve_call_flow(func):
        if isinstance(func, ast.Name):
            if func.id in bindings:
                return bindings[func.id]
            obj = getattr(builtins, func.id, None)
            if obj is not None and obj in IRI_MAP:
                return IRI_MAP[obj]
            return None
        if (isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Name)
                and func.value.id in modules):
            mod = modules[func.value.id]
            obj = getattr(mod, func.attr, None)
            if obj is None:
                return None
            return IRI_MAP.get(obj)
        return None

    program = None
    if "main" in func_defs and "main" in func_iris:
        entry = func_iris["main"]
        stage(module_iri, f"{stem} loads", 1.2)
        stage(entry, "main() starts", 1.0)
        walk_body(func_defs["main"].body)
        if stages:
            program = {"entry": entry, "stages": stages}

    return {
        "provenance": pyx.slug(stem),
        "nodes": list(var_nodes.values()),
        "links": flow_links,
        "program": program,
    }


def _function_type_iri(g: Graph):
    if types_mod.FunctionType in IRI_MAP:
        return IRI_MAP[types_mod.FunctionType]
    return None


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: extract_python_file.py <file.py> [...]")
    g = Graph()
    g.bind("py", PY)
    g.bind("rdfs", RDFS)
    flows = []
    for path_str in sys.argv[1:]:
        path = Path(path_str)
        _, flow = extract_file(path, g)
        flows.append((path, flow))
    if len(sys.argv) == 2:
        out = OUT_DIR / (pyx.slug(Path(sys.argv[1]).stem) + ".ttl")
    else:
        out = OUT_DIR / "python-files.ttl"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    g.serialize(destination=str(out), format="turtle")
    print(f"file instances written -> {out.relative_to(ROOT)}")
    print(f"  triples: {len(g)}")

    flow_dir = ROOT / "data" / "flow"
    flow_dir.mkdir(parents=True, exist_ok=True)
    for path, flow in flows:
        fout = flow_dir / (pyx.slug(path.stem) + ".json")
        fout.write_text(json.dumps(flow, indent=1, ensure_ascii=False),
                        encoding="utf-8")
        n_stages = len(flow["program"]["stages"]) if flow["program"] else 0
        print(f"flow fragment -> {fout.relative_to(ROOT)} "
              f"({len(flow['nodes'])} variables, {len(flow['links'])} links, "
              f"{n_stages} stages)")


if __name__ == "__main__":
    main()
