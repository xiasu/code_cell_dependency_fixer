define([
    'base/js/namespace',
    'base/js/events',
    'base/js/utils',
    'notebook/js/codecell'
    ], function(Jupyter, events,utils,codecell) {
    var codeBlocksExecuted;
    var ObjectList;
    var importingCells;
    var CodeCell = codecell.CodeCell;
    
      var insert_cell = function() {
          //First get the total cell count
          var cellCount=JSON.parse(JSON.stringify(Jupyter.notebook.ncells()));
          //console.log("There are ",cellCount," cells at first");
          //var lastCell=Jupyter.notebook.get_cell(cell_count-1)
          //First get the currently selected cell. If failed, export all cells
          var selected=Jupyter.notebook.get_selected_cell();
           //console.log(selected);
          var index=selected.input_prompt_number;
           //console.log("selected cell index is ",index);
          Jupyter.notebook.select(cellCount-1,false);
          //console.log(codeBlocksExecuted);
          for(var i=0; i<codeBlocksExecuted.length;i++)
          {
              if(codeBlocksExecuted[i].Index>index)//Only export cells executed before the selected one
                  break;
              //console.log(codeBlocksExecuted[i].Index);
              Jupyter.notebook.
                insert_cell_below().
                set_text(codeBlocksExecuted[i].Content);
                Jupyter.notebook.select_next();
          }
          //console.log("There are ",JSON.parse(JSON.stringify(Jupyter.notebook.ncells()))," cells after adding");
        //Jupyter.notebook.copy_notebook();
          var that = Jupyter.notebook;
          var base_url = Jupyter.notebook.base_url;
          var w = window.open('', IPython._target);
          var parent = utils.url_path_split(Jupyter.notebook.notebook_path)[0];
          var p;
          var newDir;
          if (Jupyter.notebook.dirty && Jupyter.notebook.writable) {
              p = Jupyter.notebook.save_notebook(true);
          } else {
              p = Promise.resolve();
          }
          return p.then(function () {
            //console.log(that.notebook_path)
            //console.log(parent)
            that.contents.copy(that.notebook_path, parent).then(
                function (data) {
                    //console.log(data);
                    w.location = utils.url_path_join(base_url, 'notebooks', utils.encode_uri_components(data.path));//Give file name to new notebook
                    //w.location = utils.url_path_join(base_url, 'notebooks',"Exported Notebook.ipynb");//Give file name to new notebook
                    //console.log(base_url);
                    //console.log(data.path);
                    //console.log(utils.encode_uri_components(data.path));
                    //newDir=utils.url_path_join(base_url, 'notebooks', utils.encode_uri_components(data.path));//Give file name to new notebook
                    newDir=utils.url_path_join(utils.encode_uri_components(data.path));
                    //console.log(newDir);
                    var model = {
                        type : "notebook",
                        content : Jupyter.notebook.toJSON()
                    };
                    //console.log("The copied model should have ",JSON.parse(JSON.stringify(Jupyter.notebook.ncells()))-cellCount," cells");
                    model.content.cells.splice(0,cellCount)
                    //console.log(model);
                    //console.log(newDir);
                    that.contents.save(newDir,model);
                    //Then remove the added cells
                    for (var i=0;i<codeBlocksExecuted.length;i++)
                    Jupyter.notebook._unsafe_delete_cell(cellCount);
                    //that.contents.rename(newDir,"ExportedNotebook.ipynb")
                },
                function(error) {
                    w.close();
                    that.events.trigger('notebook_copy_failed', error);
                }
            );

        });

        //Jupyter.notebook.execute_cell_and_select_below();
      };
      // Add Toolbar button
      var AddButton = function () {
          //console.log();
          events.on('execute.CodeCell', recordCell);
          events.on('execute.CodeCell', varRefresh);
          events.on('varRefresh', varRefresh);
          events.on('kernel_restarting.Kernel',varRefresh);//Not working!
          events.on('kernel_restarting.Kernel',resetRecord);//Not working!

          Jupyter.toolbar.add_buttons_group([
              Jupyter.keyboard_manager.actions.register ({
                  'help': 'Export dependent code cells for selected output module',
                  'icon' : 'fa-paper-plane',
                  'handler': insert_cell
              }, 'Code Dependency Fixer', 'Fixer')
          ])
      }
      function recordCell (evt, data) {
         //console.log(data.cell);
        codeBlocksExecuted.push({"Index":"*","Content":data.cell.get_text(),"Id":data.cell.last_msg_id,"Dependency":new Array()});
        //codeBlocksExecuted.push({"Index":codeBlocksExecuted.length,"Content":JSON.parse(JSON.stringify(data.cell.get_text()))});
    }
    
    function recordObjectList (msg) {
        //console.log(msg)
        var varList = JSON.parse(String(msg.content['text']))
        var curIndex = Math.max(...codeBlocksExecuted.map(o => o.Index))
        const exclude_names = ['get_ipython', 'var_dic_list'];
        varList.forEach(listVar => {
            if (!exclude_names.includes(listVar.varName)) {
            var found = false;
            for (var i = 0; i < ObjectList.length; i++) {
                if (ObjectList[i].Name == listVar.varName) {
                    if (ObjectList[i].Type != listVar.varType || ObjectList[i].Value != listVar.varContent) {
                        console.log(listVar);
                        console.log(ObjectList[i]);

                        ObjectList[i].Type = listVar.varType;
                        ObjectList[i].Value = listVar.varContent;
                        ObjectList[i].Index = curIndex;
                    }
                    found = true;
                    break;
                }
            }
            if (! found) {
                ObjectList.push({'Name':listVar.varName, "Type":listVar.varType, "Value": listVar.varContent, "Index": curIndex});
            }}
        })
        console.log(ObjectList);
        
    }
    function recordByteCode(msg)
    {
        //Continue analyzing bytecode. When
        console.log("Bytecode result: ",msg)
        //Break down bytecode lines
        bytecode=msg.content.text
        lines=bytecode.split('\n')
        var cellIndex=parseInt(lines[0])
        var lineCount=0
        var nameLoaded=""//Stores classname only
        var methodLoaded=""//Stores the top of stash method name so calling function can be directed correctly
        for(var i=1 ;i<lines.length;i++){//Analyze each line of code in this loop. No need to record each bytecode, just mark all prev cells
            var btc=parseLine(lines[i])
            if(btc.isDisassembly){
                break;
            }
            if(btc.isEmpty){
                continue;
            }
            if(btc.lineCount!=0){
                lineCount=btc.lineCount
                nameLoaded=""
                methodLoaded=""
            }
            switch (btc.code){
                case "LOAD_NAME":{//Figure out what is this name. If it's a var, make a dependency. If it's a class, make a dependency and mark it
                    var retrieved=retrieveVariable(btc.name)
                    if( retrieved!=null){
                        if(retrieved.Type=="type" || classList.includes(retrieved.Type)){
                            nameLoaded=retrieved.name
                        }
                        //Add dependency
                        for(var j=0;j<codeBlocksExecuted.length;j++){
                            if(codeBlocksExecuted[j].Index==cellIndex){
                                    codeBlocksExecuted[j].Dependency.push(retrieved.Index)
                            }
                        }
                    }
                }
                case "STORE_NAME":{//Update the var recent change cell
                    var retrieved=retrieveVariable(btc.name)
                    if( retrieved!=null){
                        retrieved.Index=cellIndex
                    }
                }
                case "CALL_FUNCTION":{//Make a dependency, and also let parse the function
                    if(classList.includes(nameLoaded) && btc.name==""){//Calling a construction function in this case. Generate bytecode for this construction function
                        generateFunctionBytecode(nameLoaded+".__init__")
                    }
                    else{
                        if(nameLoaded!=""){//Make dependency to this function, and generate bytecode for this
                            var retrieved=retrieveVariable(btc.name)
                            if( retrieved!=null){
                                retrieved.Index=cellIndex
                                generateFunctionBytecode(btc.name)
                            }
                        }
                    }
                }
                case "MAKE_FUNCTION":{//Update the var recent change cell
                    if(btc.name!=""){//If name is empty, it's just making a class. Do nothing. If not empty, find the function and update cell index
                        var retrieved=retrieveVariable(btc.name)
                        if(retrieved!=null){
                            retrieved.Index=cellIndex
                        }
                    }
                }
                case "LOAD_BUILD_CLASS":{//Get into the build class mode. Probably do nothing now?
                    nameLoaded="type"
                }
                case "LOAD_ATTR":{//Probably do mothing?

                }
                case "STORE_ATTR":{//update recent change cell

                }
                case "LOAD_METHOD":{//Probably do mothing?

                }
                case "CALL_METHOD":{//generate bytecode for this
                    generateFunctionBytecode(nameLoaded+"."+btc.name)
                }
                case "IMPORT_NAME":{//Just add this cell to the import list. Make sure it's included in output
                    if(!importingCells.contains(cellIndex)){
                        importingCells.push(cellIndex);
                    }
                }
            }
        }
        //if(instr.opname in ['LOAD_NAME','STORE_NAME','LOAD_GLOBAL','MAKE_FUNCTION','CALL_FUNCTION','LOAD_BUILD_CLASS','LOAD_ATTR','STORE_ATTR','LOAD_METHOD','STORE_METHOD'])
    }
    function retrieveVariable(name){
          for(var i=0;i<ObjectList.length;i++){
              if(ObjectList[i].Name==name)
                  return ObjectList[i]
          }
          return null
    }
    function parseLine(line){
          var btc = {isDisassembly:false, isEmpty:false, code:"",lineCount:0,name:""};
          if(line.length<=1){
              btc.isEmpty=true;
              return btc;
          }
          if(line[0]=='D'){
              btc.isDisassembly=true;
              return btc;
          }
          var head=line.slice(0,10).trim()
          var tail=line.slice(10,line.length).trim()
          if(head.length==0){
              btc.lineCount=0;
          }
          else{
              btc.lineCount=parseInt(head)
          }
          var tailSplit=tail.split('(')
          if(tailSplit.length==1){
              btc.name="";
          }
          else{
              btc.name=tailSplit[1].split(')')[0];
          }
          btc.code=tailSplit[0].split(' ')[1];
          return btc;

    }
    function patch_CodeCell_get_callbacks () {
        console.log('patching CodeCell.prototype.get_callbacks');
        var old_get_callbacks = CodeCell.prototype.get_callbacks;
        CodeCell.prototype.get_callbacks = function () {
            var callbacks = old_get_callbacks.apply(this, arguments);

            var cell = this;
            var prev_reply_callback = callbacks.shell.reply;
            callbacks.shell.reply = function (msg) {
                if (msg.msg_type === 'execute_reply' && msg.content.status=='ok') {//TODO check if this only means successful run

                    //console.log(msg.content.execution_count)
                    //console.log(msg.parent_header.msg_id)
                    //Update code block execution count
                    for(var i=0; i<codeBlocksExecuted.length;i++)
                    {
                        if(codeBlocksExecuted[i].Id==msg.parent_header.msg_id)
                        {   //console.log(msg);
                            codeBlocksExecuted[i].Index=msg.content.execution_count;
                            //console.log(codeBlocksExecuted[i]);
                            //Call bytecode parser
                            getBytecode(codeBlocksExecuted[i].Content,i)
                            break;
                        }
                    }

                }
                else {
                    //console.log('msg_type', msg.msg_type);
                    //remove extra cell that got failed in running
                    for(var i=0; i<codeBlocksExecuted.length;i++)
                    {
                        if(codeBlocksExecuted[i].Id==msg.parent_header.msg_id)
                        {
                            codeBlocksExecuted.splice(i,1)
                            break;
                        }
                    }
                }
                return prev_reply_callback(msg);
            };
            return callbacks;
        };
    }
    function resetRecord(){
          codeBlocksExecuted=new Array();
        ObjectList = new Array();
        importingCells=new Array();
    }
    // Run on start
    function load_ipython_extension() {
          codeBlocksExecuted=new Array();
            ObjectList = new Array();
            importingCells=new Array();
          patch_CodeCell_get_callbacks();
        // Add a default cell if there are no cells
        AddButton();
    }
    
    var varRefresh = function() {
        var libName = Jupyter.notebook.base_url + "nbextensions/code_cell_dependency_fixer/var_list.py";
        $.get(libName).done(function(data) {
            //console.log(data);
            Jupyter.notebook.kernel.execute(data, { iopub: { output: recordObjectList } }, { silent: false });
        }).fail(function() {
            console.log('Failed to load ' + libName);
        });
    }
    var getBytecode = function(content,index) {
        var libName = Jupyter.notebook.base_url + "nbextensions/code_cell_dependency_fixer/break_cell_and_parse_bytecode.py";
        $.get(libName).done(function(data) {
            //console.log("t='abc'\n"+data);
            //add the code text context to data
            data="content=\'\'\'"+content+"\'\'\'\n"
                +"index="+index+"\n"
                +data
            console.log(data);
            Jupyter.notebook.kernel.execute(data, { iopub: { output: recordByteCode} }, { silent: false });
        }).fail(function() {
            console.log('Failed to load ' + libName);
        });
    }
    var generateFunctionBytecode=function(funcName,index){
          data="import dis\nprint("+index+")\n"+"dis.dis("+funcName+")"
          Jupyter.notebook.kernel.execute(data, { iopub: { output: recordByteCode} }, { silent: false });
    }
    return {
        load_ipython_extension: load_ipython_extension,
        varRefresh: varRefresh
    };
});
