/*
        *File: DockerSandbox.js
        *Author: Osman Ali Mian/Asad Memon
        *Created: 3rd June 2014
        *Revised on: 25th June 2014 (Added folder mount permission and changed executing user to nobody using -u argument)
        *Revised on: 30th June 2014 (Changed the way errors are logged on console, added language name into error messages)
*/


/**
         * @Constructor
         * @variable DockerSandbox
         * @description This constructor stores all the arguments needed to prepare and execute a Docker Sandbox
         * @param {Number} timeout_value: The Time_out limit for code execution in Docker
         * @param {String} path: The current working directory where the current API folder is kept
         * @param {String} folder: The name of the folder that would be mounted/shared with Docker container, this will be concatenated with path
         * @param {String} vm_name: The TAG of the Docker VM that we wish to execute
         * @param {String} compiler_name: The compiler/interpretor to use for carrying out the translation
         * @param {String} file_name: The file_name to which source code will be written
         * @param {String} code: The actual code
         * @param {String} output_command: Used in case of compilers only, to execute the object code, send " " in case of interpretors
*/
var DockerSandbox = function(timeout_value, path, folder, vm_name, compiler_name, workspace_path, file_name, output_command, languageName, stdin_data)
{

    this.timeout_value=timeout_value;
    this.path=path;
    this.folder=folder;
    this.vm_name=vm_name;
    this.compiler_name=compiler_name;
    this.workspace_path=workspace_path;
    this.file_name=file_name;
    this.output_command=output_command;
    this.langName=languageName;
    this.stdin_data=stdin_data;
}


/**
         * @function
         * @name DockerSandbox.run
         * @description Function that first prepares the Docker environment and then executes the Docker sandbox
         * @param {Function pointer} success ?????
*/
DockerSandbox.prototype.run = function(success)
{
    var sandbox = this;

    this.prepare(function(){
        sandbox.execute(success);
    });
}


/*
         * @function
         * @name DockerSandbox.prepare
         * @description Function that creates a directory with the folder name already provided through constructor
         * and then copies contents of folder named Payload to the created folder, this newly created folder will be mounted
         * on the Docker Container. A file with the name specified in file_name variable of this class is created and all the
         * code written in 'code' variable of this class is copied into this file.
         * Summary: This function produces a folder that contains the source file and 2 scripts, this folder is mounted to our
         * Docker container when we run it.
         * @param {Function pointer} success ?????
*/
DockerSandbox.prototype.prepare = function(success)
{
    var exec = require('child_process').exec;
    var fs = require('fs');
    var sandbox = this;

    var cp_workspace = "mkdir "+this.path+this.folder + " && cp -r "+this.path+"/data/"+this.workspace_path+"/* " + this.path+this.folder + " && chmod -R 777 "+this.path+this.folder;
    var cp_payload = "cp --preserve=ownership,mode "+this.path+"/Payload/* " + this.path+this.folder;

    exec(cp_workspace, function(err) {
        exec(cp_payload, function() {
            if (err)
            {
                console.log(err);
            }
            else
            {
                console.log(sandbox.langName+" environment is ready!");

                fs.writeFile(sandbox.path+sandbox.folder+"/inputFile", sandbox.stdin_data, function(err2)
                {
                    if (err2)
                    {
                        console.log(err2);
                    }
                    else
                    {
                        console.log("Input file is ready!");
                    }
                });
            }

            success();
        });
    });
}

/*
         * @function
         * @name DockerSandbox.execute
         * @precondition: DockerSandbox.prepare() has successfully completed
         * @description: This function takes the newly created folder prepared by DockerSandbox.prepare() and spawns a Docker container
         * with the folder mounted inside the container with the name '/usercode/' and calls the script.sh file present in that folder
         * to carry out the compilation. The Sandbox is spawned ASYNCHRONOUSLY and is supervised for a timeout limit specified in timeout_limit
         * variable in this class. This function keeps checking for the file "Completed" until the file is created by script.sh or the timeout occurs
         * In case of timeout an error message is returned back, otherwise the contents of the file (which could be the program output or log of
         * compilation error) is returned. In the end the function deletes the temporary folder and exits
         *
         * Summary: Run the Docker container and execute script.sh inside it. Return the output generated and delete the mounted folder
         *
         * @param {Function pointer} success ?????
*/

DockerSandbox.prototype.execute = function(success)
{
    var exec = require('child_process').exec;
    var fs = require('fs');
    var myC = 0;    //variable to enforce the timeout_value
    var sandbox = this;

    //this statement is what is executed
    var st = this.path+'DockerTimeout.sh '+this.timeout_value+'s -itv "'+this.path+this.folder+'":/usercode '+this.vm_name+' /usercode/script.sh '+this.compiler_name+' '+this.file_name+' '+this.output_command;

    //log the statement in console
    console.log(st);

    //execute the Docker, This is done ASYNCHRONOUSLY
    exec(st);
    console.log("------------------------------")

    //Check for File-content of "completed" every 100 milisecs
    var intid = setInterval(function() {
        myC = myC + 0.1;

        fs.readFile(sandbox.path + sandbox.folder + '/completed', 'utf8', function(err, data) {
            if(!data) data = "";
            data = data.toString();

            // if data is not yet available and the file interval is not yet up
            // check for too-long output & error, if no problem then continue
            if (data.length == 0 && myC < sandbox.timeout_value)
            {
                var log = fs.readFileSync(sandbox.path + sandbox.folder + '/logfile.txt', 'utf8').toString();
                var errors = fs.readFileSync(sandbox.path + sandbox.folder + '/errors', 'utf8').toString();

                if (log.length <= 10000 && errors.length <= 10000) {
                    return;
                } else {
                    console.log("Output/errors is too long: "+sandbox.folder+" "+sandbox.langName)

                    if(log.length > 10000) log = "Output is too long!";
                    if(errors.length > 10000) errors = "Errors is too long!";

                    success(log, sandbox.timeout_value, errors)
                }
            }
            // if data is available, simply display a message and proceed
            else if (myC < sandbox.timeout_value)
            {
                console.log("DONE")

                var lines = data.split('*-COMPILEBOX::ENDOFOUTPUT-*')
                data=lines[0]
                var time=lines[1]

                if(data.length > 10000) data = "Output is too long!";

                //check for possible errors
                fs.readFile(sandbox.path + sandbox.folder + '/errors', 'utf8', function(err2, errors)
                {
                	if(!errors) errors=""
                    if(errors.length > 10000) errors = "Errors is too long!";
               		console.log("Error file: ")
               		console.log(errors)

               		console.log("Main File")
                    console.log(data)

        			console.log("Time: ")
        			console.log(time)

       	           	success(data, time, errors)
                });
            }
            // if time is up. Save an error message to the data variable
            else
            {
            	//Since the time is up, we take the partial output and return it.
            	fs.readFile(sandbox.path + sandbox.folder + '/logfile.txt', 'utf8', function(err, log) {
            		if (!log) log = "";
                    log = log.toString();

                    if(log.length <= 10000) log += "\nExecution Timed Out!";
                    else log = "Output is too long!";

                    console.log("Timed Out: "+sandbox.folder+" "+sandbox.langName)
                    success(log, sandbox.timeout_value, "Execution Timed Out!")
            	});
            }

            //now remove the temporary directory
            console.log("ATTEMPTING TO REMOVE: " + sandbox.path + sandbox.folder);
            console.log("------------------------------")
            exec("rm -rf " + sandbox.path + sandbox.folder);

            clearInterval(intid);
        });
    }, 100);

}


module.exports = DockerSandbox;
