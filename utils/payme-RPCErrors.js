exports.RPCErrors = {
    TransportError: function () { return { code: -32300, message: "Transport Error", data: null, } },
    AccessDeniet: function () { return { code: -32504, message: "AccessDeniet", data: null } },
    ParseError: function () { return { code: -32700, message: "Parse Error", data: null } },
    MethodNotFound: function () { return { code: -32601, message: "Method not found", data: null } },
};
