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

  parse_group = function (input) {
      var regx_expr = /^(\w+\s*)+(?:\s*:\s*(\d+\s*)*)?;/g,
          regx_token = /(?=[\S\n]|$)/g,
          position = 0, rows = [], line;
          match;

      while (true) {
          regx_token.lastIndex = position;
          regx_token.exec(input);
          position = regx_token.lastIndex;
          if (position === input.length) break;

          match = regx_expr.exec( input.substring(position) );
          if ( !match ) error( "Incorrect group format." );

          line = match[1].split(/\s+/);
          if ( match[2] ) line.unshift( match[2].split(/\s+/) );
          rows.push( line );
      }

      return rows;
  },

  parser = function (input) {

  var
    status = 'line',
  
    position = 0,
  
    position_token = 0,
  
    components = [],

    fields = [],

    groups = [],

    rules = [],

    actmap = {
      line: {
          '!defcomponent': function () {
              status = 'defcomponent';
          },
          
          '!deffield': function () {
              status = 'deffield';
          },

          '!defgroup': function () {
              status = 'defgroup';
          },

          '!defrule': function () {
              status = 'defrule';
          },

          'eol': function () { position += 1; },

          'eof': function () {
              status = 'end';
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
              status = 'line';
          },

          'eof': function () {
              status = 'end';
          }
      },

      deffield: {
          'letter': function () {
              var match = /^(\w+)\s+(\w+)\s*(?:\(([^\0]*?)\))?(?=\n|$)/.exec( input.substring(position_token) );

              if ( !match) error('Incorrect format of deffield.');

              move_forward( position_token + match[0].length );

              fields.push([ match[1], match[2], match[3] ]);
              status = 'line';
          },

          'eof': function () {
              status = 'end';
          }
      },

      defgroup: {
          'letter': function () {
              var match = /^(\w+)(?=\s*{)/.exec( input.substring(position_token) ),
                  code, codematch;

              if ( !match) error('Incorrect format of defgroup.');

              move_forward( position_token + match[0].length );

              codematch = (/^{$([^\0]*?)^}/m).exec( input.substring(position_token) );
              code = codematch[1];
              move_forward( position_token + codematch[0].length );

              groups.push([ match[1], codematch[1] ]);
              status = 'line';
          },

          'eof': function () {
              status = 'end';
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
              status = 'line';
          },

          'eof': function () {
              status = 'end';
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
        var ch = move_forward();

        // if ( regx_token.lastIndex === input.length ) return 'eof';
        if (ch === "") return 'eof';

        switch (ch) {
        case '!':
            var cmd = input.substring(position_token ).split(/\s/, 1)[0];
            move_forward( position_token + cmd.length );
            return cmd;
        case '\n':
            return 'eol';
        default:
            if (/\w/.test(ch)) return 'letter';
            error('Unexpected input');
        }
    },
    
    fn, token;

    while ( status !== 'end' ) {
        token = reco_token();
        fn = actmap[status][token];
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

      var Field = function () {
          var node = ( this.node = document.createElement('div') );
          node.className = "-vn-field";
          node.innerHTML = this.view;
      };

      Field.prototype = component;

      return Field;
  },

  Group = function (engine, name, code) {
      this.engine = engine;
      this.name = name;

      console.log( "Group: " + name );
  },

  Rule = function (engine, name, code) {
      this.engine = engine;
      this.name = name;

      console.log( "Rule: " + name );
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
              this.groups[ e[0] ] = new Group( this, e[0], e[1] );
          }

          for (i = 0, len = rules.length; i < len; i++) {
              e = rules[i];
              this.rules[ e[0] ] = new Rule( this, e[0], e[1] );
          }

      }
  });
  
  window.parser = parser;
  window.Vngin = Engine;

})();
