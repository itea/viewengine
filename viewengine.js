(function () {

var
  error = function (msg) {
      throw new Error(msg);
  },

  noop = function () {},

  trim = String.prototype.trim ?
      function (s) { return s == null ? null : s.trim(); } :
      function (s) { return s == null ? null : s.replace(/^\s+|\s+$/, ""); },

  forEach = Array.prototype.forEach ?
      function (a, cbk, o) { a.forEach(cbk, o); } :
      function (a, cbk, o) {
          var i, len, e;
          for (i = 0, len = a.length; i < len; i++) {
              cbk.apply(o, e, i, a);
          }
      },

  extend = function(target) {
      var e, src, i = 1, len = arguments.length, keys, j, length, e;

      if ( typeof arguments[ len -1 ] === "string" ) {
          keys = trim(arguments[ len -1 ]).split(/\s+/);
          if (keys[0] === '') keys = undefined;
      }

      for (; i < len; i++) {
          src = arguments[i];
          if ( !src ) continue;

          if (keys) for (j = 0, length = keys.length; j < length; j++) {
              e = keys[j];
              target[e] = src[e];

          } else for (e in src) {
              target[e] = src[e];
          }
      }

      return target;
  },

  regx_literalness = /^[\x20\t\n\r]*(?:([$A-Za-z_](?:[$\w])*)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)|"((?:[^\r\n\t\\\"]|\\(?:["\\\/trnfb]|u[0-9a-fA-F]{4}))*)"|\/((?:[^\/\\]+|\\[/\\trnfb])+)\/)/,

  _push_arg = function (input, args, acceptIdentifier) {
      var match = regx_literalness.exec( input );

      if ( !match ) error( "Unexpected input. " );

      if ( match[1] ) {
          switch (match[1]) {
          case 'true':
              args.push(true);
              break;
          case 'false':
              args.push(false);
              break;
          case 'null':
              args.push(null);
              break;
          case 'undefined':
              args.push(undefined);
              break;
          default:
              if ( !acceptIdentifier ) error(" Undexpected input: " + match[1]);
              args.push( new Symbol(match[1]) );
          }

      } else if ( match[2] ) { // number
          args.push( +match[2] );

      } else if ( match[3] ) { // string
          args.push( match[3] );

      } else { // regular expression
          args.push( new RegExp (match[4]) );
      }

      return match[0].length;
  },

  parse_args = function (input, position, move_forward, acceptIdentifier) {
      var args = [], ch = input.charAt(position), len;
      if (ch === '(') { // deal args
          position ++;
          move_forward(1);
  
          while (true) {
              len = _push_arg(input.substring(position), args, acceptIdentifier);
              position += len;
              ch = move_forward(len);
              if (ch === '') error("Unexpected EOF");
              if (ch === ',') {
                  move_forward(1);
                  position ++;
                  while ( /\s/.test( input.charAt(position) ) ) position ++;
              } else if (ch === ')') {
                  move_forward(1);
                  position ++;
                  break;
              }
          }
      }
      return args;
  },

  parse_script = function (input) {
    var
      state = 'line',
    
      position = 0,
    
      position_token = 0,
    
      components = [],

      aliases = [],

      rules = [],

      runcode,

      actmap = {
        line: {
            '!component': function () {
                state = 'defcomponent';
            },
            
            '!alias': function () {
                state = 'alias';
            },

            '!rule': function () {
                state = 'defrule';
            },

            '!run': function () {
                state = 'defrun';
            },

            'letter': function () {
                var cmd = input.substring(position_token ).split(/\s/, 1)[0];
                switch (cmd) {
                case "defcomponent":
                case "alias":
                case "defrule":
                case "defrun":
                    break;
                default:
                    error("Unkonw command: " + cmd);
                }
                move_forward( cmd.length );
                state = cmd;
            },

            '#': function () {
                var pos = input.indexOf('\n', position_token) +1;
                if (pos === 0) pos = input.length;
                position = pos;
            },

            'eol': function () { position += 1; },

            'eof': function () {
                state = 'end';
            }
        },

        defcomponent: {
            'letter': function () {

                /* The format is: <name> <inherit name> [:<enclosing tag name)] */
                var match = (/^([A-Za-z_]\w*)(?:[\x20\t]+([A-Za-z_]\w*))?[\x20\t]*:[\x20\t]*$(?:[\n\r]*([^\0]*?)[\n\r]*)^~/m).exec( input.substring(position_token) ),
                    code, codematch;

                if ( !match ) error("Incorrect format of defalias.");

                move_forward( match[0].length );

                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                if (codematch) {
                    code = codematch[1];
                    move_forward( codematch[0].length );
                }

                components.push([ match[1], match[2], match[3], code ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        alias: {
            'letter': function () {
                var match = /^([A-Za-z_]\w*)[\x20\t]+([A-Za-z_]\w*)/.exec( input.substring(position_token) ),
                    args;

                if ( !match) error('Incorrect format of defalias.');

                move_forward( match[0].length );

                args = parse_args(input, position_token, move_forward);

                if (move_forward() !== ';') error("Expecting ';'.");
                move_forward(1);

                aliases.push([ match[1], match[2], args ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defrule: {
            'letter': function () {
                var match = /^(\w[\d\w]*)(?:\s*\(\s*([$A-Za-z_](?:[$\w])*(?:\s*,\s*[$A-Za-z_](?:[$\w])*)*)\s*\))?(?=\s*{)/.exec( input.substring(position_token) ),
                    code, codematch;

                if ( !match) error('Incorrect format of defrule.');

                move_forward( match[0].length );

                codematch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( codematch[0].length );

                rules.push([ match[1], match[2] ? match[2].split(/\s*,\s*/) : [], codematch[1] ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defrun: {
            '{': function () {
                var code, codematch;
                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( codematch[0].length );

                runcode = codematch[1];
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        }
      },
    
      regx_token = /(?=[\S\n]|$)/g,

      /* Move position to a nonblank char position, position_token is the exact index of the nonblank char.
       * If delta is given, it starts from position_token + delta.
       * This method return the char of the nonblank position. */
      move_forward = function ( delta ) {
          if (delta) position = position_token + delta;
          regx_token.lastIndex = position;
          regx_token.exec(input);

          position_token = regx_token.lastIndex;
          return input.charAt( position_token );
      },

      reco_token = function () {
          var ch = move_forward(), cmd;

          // if ( regx_token.lastIndex === input.length ) return 'eof';
          if (ch === "") return 'eof';

          switch (ch) {
          case '!':
              cmd = input.substring(position_token ).split(/\s/, 1)[0];
              move_forward( cmd.length );
              return cmd;
          case '\n':
              return 'eol';
          case '#':
          case '{':
              return ch;
          default:
              if (/[A-Za-z]/.test(ch)) return 'letter';
              error('Unexpected input: ' + ch);
          }
      },
      
      fn, token;

      while ( state !== 'end' ) {
          token = reco_token();
          fn = actmap[state][token];
          fn();
      }

      return [ components, aliases, rules, runcode ];
  },

  regx_selector = /^\s*(?:(\*)|([A-Za-z_]\w*)?(?:#([A-Za-z_]\w*))?(\.[A-Za-z_]\w*)*)\s*$/,
  
  parse_selectors = function (sel) {
      var ls = sel.split('/'), i, len, e, sls = [];
      
      for (i = 0, len = ls.length; i < len; i++) {
          e = ls[i];
          sls.push( parse_selector(e) );
      }

      while ( sls.length > 1 ) {
          e = sls.pop();
          sls[ sls.length - 1 ].next = e;
      }

      return sls[0];
  },

  parse_selector = function (sel) {
      var match = regx_selector.exec(sel), clzes;

      if ( !match ) error("Invalid selector: " + sel);

      if ( match[1] ) return {any: true};

      clzes = match[4];
      if (clzes) {
          clzes = clzes.substring(1).split('.');
      }

      return {
          name: match[2],
          nick: match[3],
          classes: clzes
      };
  },
    
  _build_view = function (childNodes, members, engine, avoid) {
      if (childNodes.length === 0) return;

      var i, len, e, match, lastIndex, docFrag, member, text, nodes = [],
          // regx = /{\s*@(\w[\d\w]*)\s*}/g;
          regx = /{{[\x20\t]*(([A-Za-z_]\w*)(?:#([A-Za-z_]\w*))?(\.[A-Za-z_]\w*)*)[\x20\t]*}}/g;

      for (i = 0, len = childNodes.length; i < len; i++) {
          nodes.push(childNodes[i]);
      }

      for (i = 0, len = nodes.length; i < len; i++) {
          e = nodes[i];

          if ( e.nodeType === 1 ) {
              _build_view( e.childNodes, members, engine, avoid );
              continue;
          }
          if ( e.nodeType !== 3 ) continue;

          text = e.nodeValue;
          while (true) {
              lastIndex = regx.lastIndex;
              match = regx.exec(text);
              if ( !match) break; // no match found
              
              /* avoid the component include itself */
              if ( match[1] === avoid ) error("A component cannot include itself.");

              member = engine.createComponents( match[1] );
              members.push( member );

              if ( !docFrag ) docFrag = document.createDocumentFragment();

              docFrag.appendChild( document.createTextNode( text.substring(lastIndex, match.index) ) );
              docFrag.appendChild( member.node );
          }

          if (docFrag) {
              docFrag.appendChild( document.createTextNode( text.substring(lastIndex, text.length) ) );
              e.parentNode.replaceChild( docFrag, e );
              docFrag = null;
          }

      }
  },

  defComponent = function (engine, name, inherit, view, code, createView) {

      var Component = function (initargs) {
          var node = ( this.node = createView(view) ),
              members = ( this.members = new Query(this) );

          if (node) {
              _build_view(node.childNodes, members, engine, name);
          }

          if (this.init) {
              this.init.apply( this, initargs || []);
          }
      };

      Component.prototype = new Engine.Component();

      if (inherit) extend( Component.prototype, inherit.prototype);

      if (code) {
          ( new Function("engine", "Rule", "Query", code) ).call( Component.prototype, engine, Rule, Query);
      }

      extend( Component.prototype, { name: name } );

      if (view) Component.prototype.view = view;

      return Component;
  },

  defAlias = function (engine, name, component, predefinedargs) {

      return function (args) {
          var comp = new component(args || predefinedargs || []);
          comp.name = name;
          
          return comp;
      };

  },

  /* Parse rule statements from text input. */
  parse_rule = function (input) {
    var
      state = 'statement',
      position = 0,
      statements = [],

      parse_rule_calls = function () {
          var match, args, calls = [], ch,
              regx_token = /(?=[\S]|$)/g;

          while (true) {
              match = /^([A-Za-z_$][\w$]*)(?=[\s(;])/.exec( input.substring(position) );
              if ( !match ) error("Incorrect format of rule.");
              
              ch = move_forward( match[0].length );
              
              args = parse_args(input, position, move_forward, true);

              args.unshift(match[1]);
              calls.push( args );

              ch = move_forward();
              if (ch === ';') {
                  position ++;
                  break;
              }
          }

          return calls;
      },

      actmap = {
        statement: {
            'letter': function () {
                var match = /^((?:(?:(\*)|([A-Za-z_]\w*)?(?:#([A-Za-z_]\w*))?(\.[A-Za-z_]\w*)*)(\s*|\/))+):/.exec( input.substring(position) ),
                    selectors, calls;
                if ( !match ) error("Incorrect format of rule.");

                selectors = trim( match[1] ).split(/\s+/);
                if (selectors[selectors.length] === "") selectors.pop();

                move_forward( match[0].length );

                calls = parse_rule_calls();

                statements.push( new Statement(selectors, calls) );
            },
            
            'eof': function () {
                state = 'end';
            }
        }

      },
      
      regx_token = /(?=[\S]|$)/g,
    
      move_forward = function ( delta ) {
          if (delta) position += delta;
          regx_token.lastIndex = position;
          regx_token.exec(input);

          position = regx_token.lastIndex;
          return input.charAt( position );
      },

      reco_token = function () {
          var ch = move_forward();

          if ( ch === "" ) return 'eof';

          switch (ch) {
          case ':':
          case ';':
              return ch;
          default:
              if (/[A-Za-z*#.]/.test(ch)) return 'letter';
              error('Unexpected input');
          }
      },

      fn, token;

      while ( state !== 'end' ) {
          token = reco_token();
          fn = actmap[state][token];
          if ( !fn ) error( "Unexpected input." );
          fn();
      }

      return statements;
  },

  Symbol = function (name) {
      this.name = name;
  },

  Component = function () {
  },

  Query = (function () {

  var
    Query = function (list) {          
        if ( this instanceof Query ) {
            this.merge(list);
        }
    },

    matchClasses = function (find, list) {
        var count = 0, i, len, e;
        // find every class of 'find' in 'list'.
        if (find == null || find.length === 0) return true;
        if (list == null || list.length === 0) return false;

        for (i = 0, len = find.length; i < len; i++) {
            if (list.indexOf( find[i] ) > -1) count ++;
        }

        return count === find.length;
    };

    Query.prototype = new Array();

    extend( Query.prototype, {
        /* Query components in this Query list by using selector 'sel'.
         * 'sel' is either a selector format string or a parsed selector object.
         * If 'index' passed, returned Query list contains only the Component indicated by index 'index'.
         */
        query: function (sel, index) {
            var selector = ( typeof sel === 'string' ? parse_selectors(sel) : sel ),
                ls = new Query(), i, len, e, ls2, next;

            if (selector.any) {
                ls.merge( this );

            } else {
                for (i = 0, len = this.length; i < len; i++) {
                    e = this[i];
                    if ( selector.name != null && e.name !== selector.name ) continue;
                    if ( selector.nick != null && e.nick !== selector.nick ) continue;
                    if ( ! matchClasses(selector.classes, e.classes) ) continue;
                    ls.push(e);
                }
            }

            if (selector.next) {
                next = selector.next;
                ls2 = new Query();

                for (i = 0, len = ls.length; i < len; i++) {
                    ls2.merge(ls[i].members.query( next ));
                }

                ls = ls2;
            }

            if ( typeof index === 'number' ) {
                ls = new Query( index < ls.length ? [ ls[ index ] ] : undefined );
            }

            return ls;
        },

        /* Append all the elements in 'list' into this Query list. */
        merge: function (list) {
            this.push.apply(this, list);
        },

        /* Call function named 'fnName' of the Components in this Query list,
         * using arguments in Array 'args'.
         * If 'fnName' is a function, apply it on the Components.
         */
        applyFn: function (fnName, args) {
            var i, len, e, fn;

            if ( !args ) args = [];

            for (i = 0, len = this.length; i < len; i++ ) {
                e = this[i];
                fn = typeof fnName === 'function' ? fnName : e[ fnName ];
                if (fn) fn.apply(e, args);
            }
        },

        /* Call function named 'fnName' of the Components in this Query list,
         * using arguments passed after 'fnName'.
         * If 'fnName' is a function, apply it on the Components.
         */
        callFn: function (fnName) {
            var args = [], i, len, e, fn;

            for (i = 1, len = arguments.length; i < len; i++) {
                args.push( arguments[i] );
            }

            return this.applyFn(fnName, args);
        }
    });

    return Query;

  })(),

  Statement = function (selectors, calls) {
      this.selectors = selectors;
      this.calls = calls;
  },

  Rule = function (input, argnames, name) {
      this.name = name;
      this.argnames = argnames || [];
      this.statements = [];
      if (input) this.load(input);
  },

  Engine = function (options) {
      this.components = {};
      this.aliases = {};
      this.rules = {};

      // Merge options from prototype and the passed one.
      this.options = extend( {}, defaultEngineOptions, options );

      if ( typeof this.options.viewBuilder === "string" ) {
          this.options.viewBuilder = viewBuilders[ this.options.viewBuilder ];
          if (this.options.viewBuilder == null)
              error("Non existence viewBuilder: " + options.viewBuilder);
      }

  },

  defaultEngineOptions = {},
  
  viewBuilders = {

      jQuery: function (view) {
          return view == null ? null : jQuery(view)[0];
      },

      error: function (view) {
          if (view) error( "No viewBuilder specified." );
          return null;
      }
  };

  extend( Engine.prototype, {

      /* Load Script from text input. */
      loadScript: function (input, viewBuilder) {
          var ls = parse_script(input),
              components = ls[0],
              aliases = ls[1],
              rules = ls[2],
              runcode = ls[3],
              i, len, e, ent;

          if (viewBuilder == null)
              viewBuilder = this.options.viewBuilder;

          else if (typeof viewBuilder === "string")
              viewBuilder = viewBuilders[ viewBuilder ] || viewBuilders[ "error" ];

          for (i = 0, len = components.length; i < len; i++) {
              e = components[i];
              ent = this.components[ e[1] ];
              ent = this.components[ e[0] ]
                  = defComponent( this, e[0], ent, e[2], e[3], viewBuilder);

              this.aliases[ e[0] ] = defAlias( this, e[0], ent);
          }

          for (i = 0, len = aliases.length; i < len; i++) {
              e = aliases[i];
              ent = this.components[ e[1] ];
              if ( !ent ) error( "Cannot find component: " + e[1] );

              this.aliases[ e[0] ] = defAlias( this, e[0], ent, e[2] );
          }

          for (i = 0, len = rules.length; i < len; i++) {
              e = rules[i];
              this.rules[ e[0] ] = new Rule( e[2], e[1], e[0] );
          }

          if (runcode) {
              var runfn = new Function("engine", runcode);
              this.run = function () {
                  runfn.call(null, this); 
              };
          }
      },

      /* Create Component using passed arguments in list 'args'. */
      createComponent: function (sel, args) {
          var selector = parse_selector( sel ),
              c = this.aliases[ selector.name ], instance;

          if ( !c ) error("Component " + selector.name + " does not exist.");

          instance = c(args);
          if (selector.nick) instance.nick = selector.nick;
          if (selector.classes) instance.classes = selector.classes;

          return instance;
      }
  });

  extend( Component.prototype, {

      queryMembers: function (sel, index) {
          return this.members.query(sel, index);
      },

      toString: function () {
          return [
              this.name || "",
              (this.nick ? ("#" + this.nick) : ""),
              (this.classes && this.classes.length > 0 ? ("." + this.classes.join(".")) : "")
          ].join("");
      }
  });

  extend( Rule.prototype, {
      /* Load statements from text input. */
      load: function (input) {
          this.statements.push.apply( this.statements, parse_rule(input) );
      },

      appendStatement: function (selectors) {
          if (arguments.length < 2) error("Need at least 2 parameters.");

          if (typeof selectors === 'string') {
              selectors = trim(selectors).split(/\s+/);
          } else {
              selectors = selectors.slice(); // copy
          }

          var i = 0, len = arguments.length, arg, calls = [], call;

          while( i++ < len) {
              arg = arguments[i];
              if (typeof arg === 'string') {
                  call = [arg];
              } else if (arg instanceof Array) {
                  // This kindof judge of Array is not accurate.
                  call.push.apply(call, arg);
                  calls.push(call);
              }
          }

          this.statements.push( new Statement(selectors, calls) );
      },

      /* Apply the rule on certain object */
      apply: function (obj, args) {
          var i, len, e, ctx = {};

          /* If have argument names, build runtime context. */
          if ( this.argnames.length > 0 ) {
              args = args || [];
              for (i = 0, len = this.argnames.length; i < len; i++) {
                  ctx[ this.argnames[i] ] = args[i];
              }
          }

          /* Then apply the statements one by one. */
          for (i = 0, len = this.statements.length; i < len; i++) {
              e = this.statements[i];
              e.exec(obj.members, ctx);
          }
      },

      /* Call the rule on certain object. */
      call: function (obj) {
          var i, len, args = [];

          for (i = 1, len = arguments.length; i < len; i++) {
              args.push( arguments[i] );
          }

          this.apply(obj, args);
      }
  });

  extend( Statement.prototype, {
      exec: function (members, ctx) {
          var selectors = this.selectors,
              calls = this.calls,
              objects = new Query(), i, len, e;

          for (i = 0, len = selectors.length; i < len; i++) {
              objects.merge( members.query( selectors[i] ) );
          }

          forEach( calls, function (args) {
              // The call format is [<function name>, args...]
              args = args.slice();
              var fnname = args.shift(), i, len, e, obj;

              // process variable arguments
              for (i = 0, len = args.length; i < len; i++) {
                  if ( (e = args[i]) instanceof Symbol ) {
                      args[i] = e.name in ctx ? ctx[ e.name ] : window[ e.name ];
                  }
              }

              objects.applyFn( fnname, args );

          });
      }
  });
 
  window.parse_script = parse_script;
  window.parse_rule = parse_rule;
  window.Vngin = Engine;
  Engine.Component = Component;
  Engine.Rule = Rule;
  Engine.Statement = Statement;

})();
