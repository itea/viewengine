(function () {

var
  error = function (msg) {
      throw new Error(msg);
  },

  extend = function(target, src) {
      var e;
      for (e in src) {
          target[e] = src[e];
      }
      return target;
  },

  parser = function (input) {
    var
      state = 'line',
    
      position = 0,
    
      position_token = 0,
    
      components = [],

      fields = [],

      groups = [],

      rules = [],

      actmap = {
        line: {
            '!defcomponent': function () {
                state = 'defcomponent';
            },
            
            '!deffield': function () {
                state = 'deffield';
            },

            '!defgroup': function () {
                state = 'defgroup';
            },

            '!defrule': function () {
                state = 'defrule';
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
                var match = /^(\w+)(?:\s*:\s*(\w+))?(?=\s*{)/.exec( input.substring(position_token) ),
                    view, viewmatch, code, codematch;

                if ( !match ) error();

                move_forward( position_token + match[0].length );

                if ( !match[2] ) {
                    viewmatch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                    view = viewmatch[1];
                    move_forward( position_token + viewmatch[0].length );
                }

                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( position_token + codematch[0].length );

                components.push([ match[1], match[2], view, code ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        deffield: {
            'letter': function () {
                var match = /^(\w+)\s+(\w+)\s*(?:\(([^\0]*?)\))?;/.exec( input.substring(position_token) );

                if ( !match) error('Incorrect format of deffield.');

                move_forward( position_token + match[0].length );

                fields.push([ match[1], match[2], match[3] ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defgroup: {
            'letter': function () {
                var match = /^(\w+)(?=\s*{)/.exec( input.substring(position_token) ),
                    view, viewmatch, code, codematch;

                if ( !match) error('Incorrect format of defgroup.');

                move_forward( position_token + match[0].length );

                viewmatch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                view = viewmatch[1];
                move_forward( position_token + viewmatch[0].length );

                codematch = (/^{$([^\0]*?)^}~/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( position_token + codematch[0].length );

                groups.push([ match[1], view, code ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        },

        defrule: {
            'letter': function () {
                var match = /^(\w+)(?=\s*{)/.exec( input.substring(position_token) ),
                    code, codematch;

                if ( !match) error('Incorrect format of defrule.');

                move_forward( position_token + match[0].length );

                codematch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
                code = codematch[1];
                move_forward( position_token + codematch[0].length );

                rules.push([ match[1], codematch[1] ]);
                state = 'line';
            },

            'eof': function () {
                state = 'end';
            }
        }
      },
    
      regx_token = /(?=[\S\n]|$)/g,
    
      next_token = function () {
          return input.substring(position_token ).split(/\s/, 1)[0];
      },

      move_forward = function ( pos ) {
          if (pos) position = pos;
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
              move_forward( position_token + cmd.length );
              return cmd;
          case '\n':
              return 'eol';
          case '#':
              return '#';
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

      return [ components, fields, groups, rules ];
  },

  defComponent = function (engine, name, inherit, view, code) {

      var comp = { view: view, name: name, engine: engine };

      if (inherit) extend( comp, inherit );

      ( new Function("def", code) ).call( comp, function (name, fn) {
          comp[ name ] = fn;
      } );

      return comp;
  },

  defField = function (engine, name, component, argstr) {

      var initargs;
      if (argstr) {
          initargs = (new Function( "return [" + argstr + "];"))();
      }

      var Field = function () {
          var node = ( this.node = document.createElement('div') );

          this.name = name;
          node.className = "-vn-field";
          node.innerHTML = this.view;
          
          if (this.init) {
              this.init.apply( this, initargs || []);
          }
      };

      Field.prototype = component;

      return Field;
  },

  build_groupview = function (childNodes, members, fields, groups) {
      if (childNodes.length === 0) return;

      var i, len, e, match, lastIndex, docFrag, member, text, nodes = [],
          regx = /{\s*@(\w+)\s*}/g;

      for (i = 0, len = childNodes.length; i < len; i++) {
          nodes.push(childNodes[i]);
      }

      for (i = 0, len = nodes.length; i < len; i++) {
          e = nodes[i];

          if ( e.nodeType === 1 ) {
              build_groupview( e.childNodes, members, fields, groups );
              continue;
          }
          if ( e.nodeType !== 3 ) continue;

          text = e.nodeValue;
          while (true) {
              lastIndex = regx.lastIndex;
              match = regx.exec(text);
              if ( !match) break; // no match found
              
              member = groups[ match[1] ] || fields[ match[1] ];
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

  defGroup = function (engine, name, view, code) {

      var Group = function () {
          var node = ( this.node = document.createElement('div') ),
              members = ( this.members = [] ),
              i, len, e, field;

          this.name = name;
          node.className = "-vn-group";
          node.innerHTML = view;

          build_groupview(node.childNodes, members, engine.fields, engine.groups);

      };

      ( new Function(code) ).call( Group.prototype );

      return Group;
  },

  parse_rule = function (input) {
    var
      state = 'statement',
      position = 0,
      rule = {},

      init_rule_name = function (names) {
          var i, len, name;
          for (i = 0, len = names.length; i < len; i++) {
              name = names[i];
              if ( !rule[name] ) rule[name] = {};
          }
      },

      regx_literalness = /^[\x20\t\n\r]*(?:(true|false|null|undefined)|(-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)|"((?:[^\r\n\t\\\"]|\\(?:["\\\/trnfb]|u[0-9a-fA-F]{4}))*)"|\/((?:[^\r\n\t\\\/])*)\/)/g,
    
      parse_rule_call = function (names) {
          var match, args, i, len = names.length, name,
              regx_token = /(?=[\S]|$)/g,

              parse_args = function (args) {
                  var match = regx_literalness.exec( input.substring(position) );

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

                  return move_forward( match[0].length );
              };
    
          while (true) {
              match = /^(\w+)(?=[\s(;])/.exec( input.substring(position) );
              if ( !match ) error("Incorrect format of rule.");
              
              ch = move_forward( match[0].length );
              
              args = [];
              if (ch === '(') { // deal args
                  position ++;

                  while (true) {
                      ch = parse_args(args);
                      if (ch === '') error("Unexpected EOF");
                      if (ch === ',') move_forward( 1 );
                      if (ch === ')') {
                          position ++;
                          break;
                      }
                  }
              }

              for (i = 0; i < len; i++) {
                  name = names[i];
                  rule[name][ match[1] ] = args;
              }

              ch = move_forward();
              if (ch === ';') {
                  position ++;
                  break;
              }
          }
      },

      actmap = {
        statement: {
            'letter': function () {
                var match = /^((?:\w+\s*)+):/.exec( input.substring(position) ),
                    names;
                if ( !match ) error("Incorrect format of rule.");

                names = match[1].split(/\s+/);
                if (names[names.length] === "") names.pop();

                init_rule_name(names);

                move_forward( match[0].length );

                parse_rule_call(names);
            },
            
            'eof': function () {
                state = 'end';
            }
        }

      },
      
      regx_token = /(?=[\S]|$)/g,
    
      next_token = function () {
          return input.substring(position).split(/\s/, 1)[0];
      },

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

      return rule;
  },

  Rule = function (engine, name, code) {
      // this.engine = engine;
      this.name = name;
      this.rule = parse_rule(code);
  },

  Engine = function () {
      this.components = {};
      this.fields = {};
      this.groups = {};
      this.rules = {};
  };

  extend( Engine.prototype, {
      loadScript: function (input) {
          var ls = parser(input),
              components = ls[0],
              fields = ls[1],
              groups = ls[2],
              rules = ls[3],
              i, len, e, component;

          for (i = 0, len = components.length; i < len; i++) {
              e = components[i];
              this.components[ e[0] ] = defComponent( this, e[0], e[1], e[2], e[3] );
          }

          for (i = 0, len = fields.length; i < len; i++) {
              e = fields[i];
              component = this.components[ e[1] ];
              if ( !component ) error( "Cannot find component: " + e[1] );

              this.fields[ e[0] ] = defField( this, e[0], component, e[2] );
          }

          for (i = 0, len = groups.length; i < len; i++) {
              e = groups[i];
              this.groups[ e[0] ] = defGroup( this, e[0], e[1], e[2] );
          }

          for (i = 0, len = rules.length; i < len; i++) {
              e = rules[i];
              this.rules[ e[0] ] = new Rule( this, e[0], e[1] );
          }

      }
  });
  
  window.parser = parser;
  window.parse_rule = parse_rule;
  window.Vngin = Engine;

})();
