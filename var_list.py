import json
from sys import getsizeof

from IPython import get_ipython
from IPython.core.magics.namespace import NamespaceMagics

_nms = NamespaceMagics()
_Jupyter = get_ipython()
_nms.shell = _Jupyter.kernel.shell

try:
    import numpy as np  # noqa: F401
except ImportError:
    pass


def var_dic_list():
    #types_to_exclude = ['module', 'function', 'builtin_function_or_method', 'instance', '_Feature', 'type', 'ufunc']
    types_to_exclude = ['module', 'builtin_function_or_method', '_Feature',  'ufunc']
    values = _nms.who_ls()
    vardic = [{'varName': v, 'varType': type(eval(v)).__name__, 'varContent': str(eval(v))[:200]}  # noqa

    for v in values if (v not in ['_html', '_nms', 'NamespaceMagics', '_Jupyter','var_dic_list']) & (type(eval(v)).__name__ not in types_to_exclude)] # noqa
    return json.dumps(vardic)


# command to refresh the list of variables
print(var_dic_list())
