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
                       "annotation-only, no runtime class")))
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

    return module_iri


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
    for path_str in sys.argv[1:]:
        path = Path(path_str)
        extract_file(path, g)
        out = OUT_DIR / (pyx.slug(path.stem) + ".ttl")
    if len(sys.argv) == 2:
        out = OUT_DIR / (pyx.slug(Path(sys.argv[1]).stem) + ".ttl")
    else:
        out = OUT_DIR / "python-files.ttl"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    g.serialize(destination=str(out), format="turtle")
    print(f"file instances written -> {out.relative_to(ROOT)}")
    print(f"  triples: {len(g)}")


if __name__ == "__main__":
    main()
