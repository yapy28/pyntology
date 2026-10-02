#!/usr/bin/env python3
"""Extract the Python builtins ontology by introspecting the running CPython.

The interpreter is the source of truth, so this script runs on the Python
you want described (its version is recorded in the ontology node). It emits
data/ontologies/python-builtin.ttl using the py: vocabulary:

- every public builtin type, callable and the singleton values
- the tower: py:instanceOf edges at all levels (values -> types, types ->
  metatypes, type -> type, the reflexive fixed point)
- the class lattice: py:subclassOf direct edges (the __bases__ primitive,
  deliberately non-transitive)
- method resolution order: py:mroNext chains in Python's actual linearized
  search order
- py:metaclassOf for classes with a non-standard metaclass
- py:towerLevel materialized per node (0 value, 1 type, 2 metatype,
  3 the fixed point)

Run with the project venv: .venv/bin/python src/extract_python.py
"""

import builtins
import re
import sys
import types as types_mod
from pathlib import Path

from rdflib import Graph, Literal, Namespace, RDF, URIRef

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "ontologies" / "python-builtin.ttl"

PY = Namespace("https://colibri.example/ns/py#")
RDFS = Namespace("http://www.w3.org/2000/01/rdf-schema#")
DCT = Namespace("http://purl.org/dc/terms/")
DATA = "https://colibri.example/data/python/builtin/"

# singleton and exemplar values, pedagogically chosen (all hashable:
# they key the node table by identity)
EXEMPLARS = [
    ("none", None), ("true", True), ("false", False),
    ("not-implemented", NotImplemented), ("ellipsis", Ellipsis),
    ("five", 5), ("pi", 3.14), ("hello", "hello"),
    ("pair", (1, 2)), ("empty-frozenset", frozenset()),
    ("bytes-hello", b"hello"),
]
# deep-magic builtins worth teaching even though they are underscored
KEEP_PRIVATE = {"__import__", "__build_class__"}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-") or "unnamed"


def doc_first_line(obj) -> str:
    doc = getattr(obj, "__doc__", None)
    if not isinstance(doc, str):
        return ""
    first = doc.strip().splitlines()[0].strip()
    return first[:300]


def collect_nodes():
    """Node set: public builtins + curated exemplars, closed over __class__,
    __bases__ and __mro__ so metatypes like type and object are included."""
    nodes = {}  # obj -> iri

    def add(obj, group):
        if obj in nodes:
            return
        name = getattr(obj, "__name__", None)
        if name is None:
            return
        nodes[obj] = DATA + group + "/" + slug(name)

    for name in dir(builtins):
        obj = getattr(builtins, name)
        if name.startswith("_") and name not in KEEP_PRIVATE:
            continue
        if isinstance(obj, type):
            add(obj, "type")
        elif callable(obj):
            add(obj, "callable")

    for label, value in EXEMPLARS:
        if value not in nodes:
            nodes[value] = DATA + "value/" + slug(label)

    # key runtime types from the types module: user-defined functions and
    # modules instantiate these, so they must exist in the ontology
    for name in ("FunctionType", "ModuleType", "MethodType", "CodeType"):
        add(getattr(types_mod, name), "type")

    # closure over the tower and lattice
    frontier = list(nodes)
    while frontier:
        obj = frontier.pop()
        follow = []
        cls = getattr(obj, "__class__", None)
        if cls is not None:
            follow.append(cls)
        for base in getattr(obj, "__bases__", ()):
            follow.append(base)
        if isinstance(obj, type):
            for m in obj.__mro__:
                follow.append(m)
        for target in follow:
            if target not in nodes:
                add(target, "type" if isinstance(target, type) else "value")
                if target not in frontier:
                    frontier.append(target)
    return nodes


def tower_level(obj) -> int:
    if obj is type:
        return 3
    if isinstance(obj, type) and issubclass(obj, type):
        return 2
    if isinstance(obj, type):
        return 1
    return 0


def node_type(obj):
    if obj is type or (isinstance(obj, type) and issubclass(obj, type)):
        return PY.Metatype
    if isinstance(obj, type) and issubclass(obj, __import__("builtins").BaseException):
        return PY.Exception
    if isinstance(obj, type):
        return PY.Type
    if callable(obj):
        return PY.Callable
    return PY.Value


# structural protocols: membership is materialized from dir() at build time,
# never asserted - exactly how Python recognizes duck types at call time
PROTOCOLS = {"Sized": "__len__", "Iterable": "__iter__",
             "Container": "__contains__", "Callable": "__call__"}


def emit_protocols(g, nodes):
    proto_iri = {}
    for pname, method in PROTOCOLS.items():
        iri = DATA + "protocol/" + slug(pname)
        proto_iri[pname] = iri
        s = URIRef(iri)
        g.add((s, RDF.type, PY.Protocol))
        g.add((s, RDFS.label, Literal(pname)))
        g.add((s, RDFS.comment, Literal(
            f"structural protocol: requires {method}")))
        g.add((s, PY.requiresMethod, Literal(method)))
        g.add((s, PY.towerLevel, Literal(1)))
        type_iri = nodes.get(type)
        if type_iri:
            g.add((s, PY.instanceOf, URIRef(type_iri)))
    count = 0
    for obj, iri in nodes.items():
        if not isinstance(obj, type):
            continue
        for pname, method in PROTOCOLS.items():
            if method in dir(obj):
                g.add((URIRef(iri), PY.implementsProtocol,
                       URIRef(proto_iri[pname])))
                count += 1
    return len(proto_iri), count


def main():
    nodes = collect_nodes()
    g = Graph()
    g.bind("py", PY)
    g.bind("rdfs", RDFS)
    g.bind("dcterms", DCT)
    g.bind("pytype", Namespace(DATA + "type/"))
    g.bind("pycall", Namespace(DATA + "callable/"))
    g.bind("pyval", Namespace(DATA + "value/"))

    version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    onto = URIRef(DATA + "ontology")
    g.add((onto, RDF.type, __import__("rdflib").OWL.Ontology))
    g.add((onto, DCT.title,
           Literal(f"Python builtins (CPython {version}, introspected)")))
    g.add((onto, RDFS.comment, Literal(
        "Extracted by introspecting the running CPython interpreter; the "
        "interpreter itself is the source of truth.")))

    # the builtins module: every builtin is defined in it
    builtins_mod = URIRef(DATA + "module/builtins")
    g.add((builtins_mod, RDF.type, PY.Module))
    g.add((builtins_mod, PY.towerLevel, Literal(0)))
    g.add((builtins_mod, RDFS.label, Literal("builtins")))
    g.add((builtins_mod, RDFS.comment, Literal(
        "The module CPython preloads: every builtin type, callable and "
        "singleton is defined in it.")))
    modtype = None
    if types_mod.ModuleType in nodes:
        modtype = URIRef(nodes[types_mod.ModuleType])
        g.add((builtins_mod, PY.instanceOf, modtype))

    for obj, iri in nodes.items():
        s = URIRef(iri)
        g.add((s, PY.definedIn, builtins_mod))
        g.add((s, RDF.type, node_type(obj)))
        g.add((s, PY.towerLevel, Literal(tower_level(obj))))
        name = getattr(obj, "__name__", None)
        if name is None:
            name = repr(obj)  # value exemplars: 5, 'hello', None, (1, 2)...
        g.add((s, RDFS.label, Literal(name)))
        desc = doc_first_line(obj)
        if desc:
            g.add((s, RDFS.comment, Literal(desc)))
        cls = getattr(obj, "__class__", None)
        if cls in nodes:
            g.add((s, PY.instanceOf, URIRef(nodes[cls])))
        if isinstance(obj, type):
            for base in obj.__bases__:
                if base in nodes:
                    g.add((s, PY.subclassOf, URIRef(nodes[base])))
            for a, b in zip(obj.__mro__, obj.__mro__[1:]):
                if a in nodes and b in nodes:
                    g.add((URIRef(nodes[a]), PY.mroNext, URIRef(nodes[b])))
            meta = type(obj)
            if meta is not type and meta in nodes:
                g.add((s, PY.metaclassOf, URIRef(nodes[meta])))

    n_protocols, n_implements = emit_protocols(g, nodes)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    g.serialize(destination=str(OUT), format="turtle")

    kinds = {}
    for _, _, o in g.triples((None, RDF.type, None)):
        kinds[str(o).split("#")[-1]] = kinds.get(str(o).split("#")[-1], 0) + 1
    print(f"nodes written: {len(nodes)} -> {OUT.relative_to(ROOT)}")
    print(f"  from CPython {version}")
    print(f"  by kind: {kinds}")
    print(f"  protocols: {n_protocols} declared, {n_implements} materialized "
          f"implementsProtocol facts")
    print(f"  triples: {len(g)}")


if __name__ == "__main__":
    main()
