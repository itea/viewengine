(function () {

var
  error = function (msg) {
      throw new Error(msg);
  },

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

  extend = function(target, src) {
      var e;
      for (e in src) {
          target[e] = src[e];
      }
      return target;
  },

  regx_literalness = /^[\x20\t\n\r]*(?:(true|false|null|undefined)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)|"((?:[^\r\n\t\\\"]|\\(?:["\\\/trnfb]|u[0-9a-fA-F]{4}))*)"|\/((?:[^\/\\]+|\\[/\\trnfb])+)\/)/,

  _push_arg = function (input, args) {
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

  parse_args = function (input, position, move_forward) {
      var args = [], ch = input.charAt(position), len;
      if (ch === '(') { // deal args
          position ++;
          move_forward(1);
  
          while (true) {
              len = _push_arg(input.substring(position), args);
              position += len;
              ch = move_forward(len);
              if (ch === '') error("Unexpected EOF");
              if (ch === ',' || ch === ')') {
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

      fields = [],

      groups = [],

      rules = [],

      runcode,

      actmap = {
        line: {
            '!component': function () {
                state = 'defcomponent';
            },
            
            '!field': function () {
                state = 'deffield';
            },

            '!group': function () {
                state = 'defgroup';
            },

            '!rule': function () {
                state = 'defrule';
            },

            '!run': function () {
                state = 'defrun';
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
                var match = /^(\w[\d\w]*)(?:\s+(\w[\d\w]*))?(?:\s*:\s*(\w[\d\w#:.-]*))?(?=\s*[{;])/.exec( input.substring(position_token) ),
                    view, viewmatch, code, codematch;

                if ( !match ) error("Incorrect format of deffield.");

                move_forward( match[0].length );

                viewmatch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                if (viewmatch) {
                    view = viewmatch[1];
                    move_forward( viewmatch[0].length );
                }

                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                if (codematch) {
                    code = codematch[1];
                    move_forward( codematch[0].length );
                }

                components.push([ match[1], match[2], match[3], view, code ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        deffield: {
            'letter': function () {
                var match = /^(\w[\d\w]*)\s+(\w[\d\w]*)/.exec( input.substring(position_token) ),
                    args;

                if ( !match) error('Incorrect format of deffield.');

                move_forward( match[0].length );

                args = parse_args(input, position_token, move_forward);

                if (move_forward() !== ';') error("Expecting ';'.");
                move_forward(1);

                fields.push([ match[1], match[2], args ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defgroup: {
            'letter': function () {
                /* The format is: <name> <inherit name> [:<enclosing tag name)] */
                var match = /^(\w[\d\w]*)(?:\s+(\w[\d\w]*))?(?:\s*:\s*(\w[\d\w#:.-]*))?(?=\s*[{;])/.exec( input.substring(position_token) ),
                    view, viewmatch, code, codematch;

                if ( !match) error('Incorrect format of defgroup.');

                move_forward( match[0].length );

                viewmatch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                if (viewmatch) {
                    view = viewmatch[1];
                    move_forward( viewmatch[0].length );
                }

                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                if (codematch) {
                    code = codematch[1];
                    move_forward( codematch[0].length );
                }

                groups.push([ match[1], match[2], match[3], view, code ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defrule: {
            'letter': function () {
                var match = /^(\w[\d\w]*)(?=\s*{)/.exec( input.substring(position_token) ),
                    code, codematch;

                if ( !match) error('Incorrect format of defrule.');

                move_forward( match[0].length );

                codematch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( codematch[0].length );

                rules.push([ match[1], codematch[1] ]);
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
              if (/\w/.test(ch)) return 'letter';
              error('Unexpected input');
          }
      },
      
      fn, token;

      while ( state !== 'end' ) {
          token = reco_token();
          fn = actmap[state][token];
          fn();
      }

      return [ components, fields, groups, rules, runcode ];
  },

  defComponent = function (engine, name, inherit, elementExpr, view, code) {

      var comp = { view: view, name: name, elementExpr: elementExpr };

      if (inherit) extend( comp, inherit );

      if (code) {
          try {
              ( new Function("engine", code) ).call( comp, engine );
          } catch (e) {
              window._e = e;
          }
      }

      return comp;
  },

  createElement = function (element_expr, defaultTag) {
      var element, match;
      if ( !defaultTag ) defaultTag = 'div';

      if ( !element_expr ) element = document.createElement(defaultTag);
      else {
          match = /^\s*(\w+)(?:#([\d\w-]+))?((?:\.[\d\w-]+)*)?((?:\:[\w-]+)*)?(?:&([\d\w\.-]+))?(?=\s|$)/.exec(element_expr);
          element = document.createElement(match[1]);

          if (match[2]) {
              element.setAttribute('id', match[2]);
          }
          if (match[3]) {
              element.setAttribute('class', match[3].substring(1).replace(/\./, ' '));
          }
      }

      return element;
  },

  defField = function (engine, name, component, args) {

      var Field = function () {
          var node = ( this.node = createElement(component.elementExpr) );

          this.name = name;
          this.componentName = component.name;
          if (this.view) node.innerHTML = this.view;

          if ( !component.elementExpr) {
              if (node.children.length > 0) {
                  node = node.children[0];
              } else {
                  node = node.firstChild;
              }
              node.parentNode.removeChild(node);
              this.node = node;
          }
          
          if (this.init) {
              this.init.apply( this, args || []);
          }
      };

      Field.prototype = component;

      return Field;
  },

  _build_groupview = function (childNodes, members, fields, groups, avoid) {
      if (childNodes.length === 0) return;

      var i, len, e, match, lastIndex, docFrag, member, text, nodes = [],
          regx = /{\s*@(\w[\d\w]*)\s*}/g;

      for (i = 0, len = childNodes.length; i < len; i++) {
          nodes.push(childNodes[i]);
      }

      for (i = 0, len = nodes.length; i < len; i++) {
          e = nodes[i];

          if ( e.nodeType === 1 ) {
              _build_groupview( e.childNodes, members, fields, groups, avoid );
              continue;
          }
          if ( e.nodeType !== 3 ) continue;

          text = e.nodeValue;
          while (true) {
              lastIndex = regx.lastIndex;
              match = regx.exec(text);
              if ( !match) break; // no match found
              
              member = fields[ match[1] ];

              /* avoid the group include itself */
              if ( !member && match[1] === avoid ) error("A group cannot include itself.");

              member = member || groups[ match[1] ];

              if ( !member ) error( "Cannot find: " + match[1] );
              if ( !docFrag ) docFrag = document.createDocumentFragment();

              members.push( member = new member() );
              members[ member.name ] = member;
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

  defGroup = function (engine, name, inherit, elementExpr, view, code) {

      var Group = function () {
          var node = ( this.node = createElement(elementExpr) ),
              members = ( this.members = [] ),
              i, len, e, field;

          this.name = name;

          if (view) {
              node.innerHTML = view;

              _build_groupview(node.childNodes, members, engine.fields, engine.groups, name);

              if ( !elementExpr) {
                  if (node.children.length > 0) {
                      node = node.children[0];
                  } else {
                      node = node.firstChild;
                  }
                  node.parentNode.removeChild(node);
                  this.node = node;
              }
          }

      };

      if (code) ( new Function("engine", code) ).call( Group.prototype, engine );

      return Group;
  },

  /* Parse rule statements from text input. */
  parse_rule = function (input) {
    var
      state = 'statement',
      position = 0,
      statements = [],

      parse_rule_call = function () {
          var match, args, calls = [], ch,
              regx_token = /(?=[\S]|$)/g;

          while (true) {
              match = /^([$\w][$\d\w]*)(?=[\s(;])/.exec( input.substring(position) );
              if ( !match ) error("Incorrect format of rule.");
              
              ch = move_forward( match[0].length );
              
              args = parse_args(input, position, move_forward);

              calls.push( match[1] );
              calls[ match[1] ] = args;

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
                var match = /^((?:\w[\d\w]*\s*)+):/.exec( input.substring(position) ),
                    names, calls;
                if ( !match ) error("Incorrect format of rule.");

                names = trim( match[1] ).split(/\s+/);
                if (names[names.length] === "") names.pop();

                move_forward( match[0].length );

                calls = parse_rule_call();

                statements.push({
                    names: names,
                    calls: calls
                });
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
              if (/\w/.test(ch)) return 'letter';
              error('Unexpected input');
          }
      },

      fn, token;

      while ( state !== 'end' ) {
          token = reco_token();
          fn = actmap[state][token];
          fn();
      }

      return statements;
  },

  Rule = function (name, input) {
      this.name = name;
      this.statements = [];
      if (input) this.load(input);
  },

  Engine = function () {
      this.components = {};
      this.fields = {};
      this.groups = {};
      this.rules = {};
  },

  /* This function traverse obj and build a name/instance index.
   * index_mode indicate which mode index names build:
   *   flat or F: drop hierarchy info, build a flat index. This is default.
   *   hierarchy or H: build a hierarchy index, using slash indicate seprate.
   *   shirt or S: shift hierarchy, shift hierarchy to left one level.
   */
  build_field_index = function (obj, index, index_mode) {
      if ( !index_mode ) index_mode = 'flat';

      if (obj.members) { // seems a group
          var i = 0, len = obj.members.length;
          for (; i < len; i++) {
              build_field_index(obj.members[i], index);
          }
      } else { // like a field
          if (obj.name) {
              if ( !index[ obj.name ] ) index[ obj.name ] = [];
              index[ obj.name ].push(obj);
          }
      }
  };

  extend( Engine.prototype, {
      /* Load Script from text input. */
      loadScript: function (input) {
          var ls = parse_script(input),
              components = ls[0],
              fields = ls[1],
              groups = ls[2],
              rules = ls[3],
              runcode = ls[4],
              i, len, e, ent;

          for (i = 0, len = components.length; i < len; i++) {
              e = components[i];
              this.components[ e[0] ] = defComponent( this, e[0], e[1], e[2], e[3], e[4] );
          }

          for (i = 0, len = fields.length; i < len; i++) {
              e = fields[i];
              ent = this.components[ e[1] ];
              if ( !ent ) error( "Cannot find component: " + e[1] );

              this.fields[ e[0] ] = defField( this, e[0], ent, e[2] );
          }

          for (i = 0, len = groups.length; i < len; i++) {
              e = groups[i];
              this.groups[ e[0] ] = defGroup( this, e[0], e[1], e[2], e[3], e[4] );
          }

          for (i = 0, len = rules.length; i < len; i++) {
              e = rules[i];
              this.rules[ e[0] ] = new Rule( e[0], e[1] );
          }

          if (runcode) {
              var runfn = new Function("engine", "components", "fields", "groups", "rules", runcode);
              this.run = function () {
                  runfn.call(this, this, this.components, this.fields, this.groups, this.rules);
              };
          }// else this.run = function () {};
      }
  });

  extend( Rule.prototype, {
      /* Load statements from text input. */
      load: function (input) {
          this.statements = parse_rule(input);
      },

      appendStatement: function (names) {
          if (arguments.length < 2) error("Need at least 2 parameters.");

          if (typeof names === 'string') {
              names = trim(names).split(/\s+/);
          } else {
              names = names.slice(); // copy
          }

          var i = 0, len = arguments.length, arg, calls = [], callName;

          while( i++ < len) {
              arg = arguments[i];
              if (typeof arg === 'string') {
                  calls.push( arg );
                  callName = arg;
              } else if (arg instanceof Array) {
                  // This kindof judge of Array is not accurate.
                  calls[ callName ] = arg;
              }
          }

          this.statements.push( {names: names, calls: calls} );
      },

      /* Apply the rule on certain object */
      applyOn: function (obj) {
          var index = {}, i, len, e, names, calls;

          /* First, build an index on the object. */
          build_field_index( obj, index );

          /* Then apply the statements one by one. */
          for (i = 0, len = this.statements.length; i < len; i++) {
              e = this.statements[i];
              names = e.names;
              calls = e.calls;

              forEach( calls, function (call) {
                  var args = calls[ call ] || [];

                  forEach( names, function (name) {
                      forEach( index[ name ], function (obj) {

                          if (obj && obj[ call ]) {
                              obj[ call ].apply( obj, args );
                          }
                      });

                  });

              });

          }
      }
  });
 
  window.parse_script = parse_script;
  window.parse_rule = parse_rule;
  window.Vngin = Engine;
  Engine.Rule = Rule;

})();
