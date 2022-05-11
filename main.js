define([
    'base/js/namespace',
    'base/js/events',
    'base/js/utils',
    'notebook/js/codecell'
    ], function(Jupyter, events,utils,codecell) {
    var codeBlocksExecuted;
    var CodeCell = codecell.CodeCell;
      var insert_cell = function() {
          //First get the total cell count
          var cellCount=JSON.parse(JSON.stringify(Jupyter.notebook.ncells()));
          console.log("There are ",cellCount," cells at first");
          //var lastCell=Jupyter.notebook.get_cell(cell_count-1)
          //First get the currently selected cell. If failed, export all cells
          var selected=Jupyter.notebook.get_selected_cell();
           //console.log(selected);
          var index=selected.input_prompt_number;
           console.log("selected cell index is ",index);
          Jupyter.notebook.select(cellCount-1,false);
          console.log(codeBlocksExecuted);
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
          console.log("There are ",JSON.parse(JSON.stringify(Jupyter.notebook.ncells()))," cells after adding");
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
            console.log(that.notebook_path)
            console.log(parent)
            that.contents.copy(that.notebook_path, parent).then(
                function (data) {
                    console.log(data);
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
                    console.log("The copied model should have ",JSON.parse(JSON.stringify(Jupyter.notebook.ncells()))-cellCount," cells");
                    model.content.cells.splice(0,cellCount)
                    console.log(model);
                    console.log(newDir);
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
          console.log();
          events.on('execute.CodeCell', recordCell);
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
         console.log(data.cell.last_msg_id);
        codeBlocksExecuted.push({"Index":"*","Content":data.cell.get_text(),"Id":data.cell.last_msg_id});
        //codeBlocksExecuted.push({"Index":codeBlocksExecuted.length,"Content":JSON.parse(JSON.stringify(data.cell.get_text()))});
    }
    function patch_CodeCell_get_callbacks () {
        console.log('patching CodeCell.prototype.get_callbacks');
        var old_get_callbacks = CodeCell.prototype.get_callbacks;
        CodeCell.prototype.get_callbacks = function () {
            var callbacks = old_get_callbacks.apply(this, arguments);

            var cell = this;
            var prev_reply_callback = callbacks.shell.reply;
            callbacks.shell.reply = function (msg) {
                if (msg.msg_type === 'execute_reply') {

                    //console.log(msg.content.execution_count)
                    //console.log(msg.parent_header.msg_id)
                    //Update code block execution count
                    for(var i=0; i<codeBlocksExecuted.length;i++)
                    {
                        if(codeBlocksExecuted[i].Id==msg.parent_header.msg_id)
                        {
                            codeBlocksExecuted[i].Index=msg.content.execution_count;
                            console.log(codeBlocksExecuted[i]);
                            break;
                        }
                    }
                }
                else {
                    console.log('msg_type', msg.msg_type);
                }
                return prev_reply_callback(msg);
            };
            return callbacks;
        };
    }
    function resetRecord(){
          codeBlocksExecuted=new Array();
    }
    // Run on start
    function load_ipython_extension() {
          codeBlocksExecuted=new Array();
          patch_CodeCell_get_callbacks();
        // Add a default cell if there are no cells
        AddButton();
    }
    return {
        load_ipython_extension: load_ipython_extension
    };
});
