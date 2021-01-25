'use strict';

function getUrlVars() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        vars[key] = value;
    });
    return vars;
}

function getSampleProject() {
    var proj = STOCK_PROJECT
    if ("projectId" in URL_PARAMS) {
        var urlProject = URL_PARAMS["projectId"]
        $.ajax({
            async: false,
            crossDomain: true,
            cache:false,
            url: projectsRootURL + urlProject + "/master.jpg?",
            method: "GET",
        })
        .done(() => {
            return $.ajax({
                async: false,
                crossDomain: true,
                url: projectsRootURL + urlProject + "/project.xml",
                method: "GET",
            })
        })
        .done(() => {
            proj = urlProject
        })
        .fail(() => {
            alert('Failed to load custom project. Displaying sample project')
        })
    }
    return proj
}

const IS_SAMSUNG_BROWSER = navigator.userAgent.match(/SamsungBrowser/i)
const ENV = "prod"
const PALETTE_VERSION = "V1"
const URL_PARAMS = getUrlVars()
const LAYERS = "layers" in URL_PARAMS ? URL_PARAMS['layers'] : "all"
const STOCK_PROJECT = LAYERS === 'floor' ? "samples/%7B00000000-0000-0000-0003-000000000002%7D" : "samples/%7B00000000-0000-0000-0003-000000000001%7D"
const paletteRootURL = "https://renovis-palettes.s3-us-west-2.amazonaws.com/" + PALETTE_VERSION + "/";
const renderRootURL = "https://rey6rqzvu5.execute-api.us-west-2.amazonaws.com/prod/render?"
const projectsRootURL = "https://renovis-projects.s3-us-west-2.amazonaws.com/"
const getPresignedURL = "https://rey6rqzvu5.execute-api.us-west-2.amazonaws.com/prod/get-upload-url?dev="
const renderCacheURL = "https://re2-renders.s3-us-west-2.amazonaws.com/renovis/"
const sampleProject = getSampleProject()

const e = React.createElement;
const CSSTransition = window.ReactTransitionGroup.CSSTransition 

console.log(LAYERS)

class App extends React.Component {
    constructor(props) {
        super(props);

        this.timer = 0
        this.timerId = null
        this.projectKey = sampleProject
        this.projectURL = projectsRootURL + sampleProject 

        this.state = {
            display: [
                this.projectURL + '/master.jpg',    // Stock image
                this.projectURL + '/master.jpg',
            ],
            project: {
                original: this.projectURL + '/master.jpg',
                icons: []
            },
            stock: {
                original: this.projectURL + '/master.jpg',
                icons: []
            },
            static: {
                uploadIcon: 'icon.png',
                spinnerIcon: 'spinner.gif'
            },
            uploading: false,
            showRender: false,
            currentRender: 0,
            selectedIdx: -1,
            iconViewIdx: 0,
            numIcons: 0,
            numPalettesDisplayed: 20,
            numConcurrentPreLoad: 6,
            email: '',
            overlayStyle: {
                width: 0,
            }
        }

        this.handleSelectImg = this.handleSelectImg.bind(this)
        this.handleCreate = this.handleCreate.bind(this)
        this.uploadToS3 = this.uploadToS3.bind(this)
        this.fetchXML = this.fetchXML.bind(this)
        this.fetchRender = this.fetchRender.bind(this)
        this.createRenderCarousel = this.createRenderCarousel.bind(this)
        this.handleIconClick = this.handleIconClick.bind(this)
        this.handleToggle = this.handleToggle.bind(this)
        this.handlePreviousSlide = this.handlePreviousSlide.bind(this)
        this.handleNextSlide = this.handleNextSlide.bind(this)
        this.disableIcon = this.disableIcon.bind(this)
        this.enableIcon = this.enableIcon.bind(this)
        this.preLoader = this.preLoader.bind(this)
        this.closeOverlay = this.closeOverlay.bind(this)
        this.handleEmailSubmit = this.handleEmailSubmit.bind(this)
    }

    componentDidMount() {
      
        $.ajax({
            async: true,
            crossDomain: true,
            url: paletteRootURL + (LAYERS == 'floor' ? "interior-palettes.xml" : "palettes.xml"),
            method: "GET",
        })
        .done(data => {
            var groups = data.getElementsByTagName("group");
            var paletteURLs = []
            var counter = 0
            for (var i = 0; i < groups.length; i++) {
                let groupName = groups[i].getAttribute("name")
                var group = groups[i].getElementsByTagName("palette")
                for (var j = 0; j < group.length; j++) { 
                    let paletteObj = {
                        idx: counter,
                        groupName: groupName,
                        icon: renderCacheURL + STOCK_PROJECT + '/images/V1/' + groupName + '/' + group[j].getAttribute("id").replace('{', '%7B').replace('}', '%7D'),
                        id: group[j].getAttribute("id").replace('{', '%7B').replace('}', '%7D'),
                        render: null,
                        fetching: false,
                        name : group[j].getAttribute("name")
                    }
                    paletteURLs.push(paletteObj);
                    counter += 1;
                }
            }
            var stockProject = {
                original: this.projectURL+"/master.jpg",
                icons: paletteURLs
            }

            this.setState({
                stock: JSON.parse(JSON.stringify(stockProject)),    // Make deep copy so the stock isn't referencing the same thing as the current project
                project: stockProject,
                numIcons: paletteURLs.length,
                width: $('#originalImage').width()
            })
            setTimeout(this.preLoader(0, this.projectURL), 0)
        })
        .fail(() => {
          alert("Something went wrong when loading the page. Please refresh")  
        })
        // $('[data-toggle="tooltip"]').tooltip();
    }

    // componentDidUpdate() {
    //     $('[data-toggle="tooltip"]').tooltip();
    // }

    preLoader(startIdx, projectURL) {
        if (projectURL !== this.projectURL) {return}

        var indexArr = []
        var icons = this.state.project.icons

        for (var i=startIdx; i < this.state.numIcons; i++) {
            if (icons[i].render === null) {
                indexArr.push(i)
            }
            if (indexArr.length >= this.state.numConcurrentPreLoad) {
                break
            }
        } 

        var promises = indexArr.map((item, index) => {
            return this.fetchRender(item)
        })

        $.when.apply($, promises)
        .always(() => {
            if (i < this.state.numIcons - 1) {
                setTimeout(this.preLoader(i+1, projectURL), 0)
            }
        })
    }

    disableInput(value) {
        document.getElementById("build-project-file-id").disabled = value;
        this.setState({uploading: value})
    }

    disableIcon(index) {
        var id = '#palette'+index
        $(id).addClass("disabled");
    }

    enableIcon(index) {
        $('#palette'+index).removeClass("disabled");
    }

    handleSelectImg(event) {
        var images = this.state.images;
        images[1] = {'source': URL.createObjectURL(event.target.files[0])}
        this.setState({
            images: images,
            currImg: 1
        })
    }

    handleCreate(event) {
        if (event.target.files[0] !== undefined) { 
            var file = document.getElementById("build-project-file-id").files[0]
            this.setState({
                overlayStyle: {width: "100%"}
            })
        }
    }

    handleEmailSubmit() {
        // Do email verification, regex?
        if (validateEmail(this.state.email)){
            this.getOrientation(this.uploadToS3)
            this.setState({
                overlayStyle: {width: 0}
            })
        } else {
            alert("Please enter a valid email")
        }        
    }

    closeOverlay() {
        document.removeEventListener("click", this.closeNav);
        $("#build-project-file-id").val('');
        this.setState({
            overlayStyle: {width: 0} 
        });
    }

    getOrientation(callback) {
        var file = document.getElementById("build-project-file-id").files[0],
            reader = new FileReader();

        reader.onload = function(e) {
            const cleanup = (orientation, callback) => {document.getElementById("build-project-file-id").orientation = orientation; return callback()}
            var view = new DataView(e.target.result);
            if (view.getUint16(0, false) != 0xFFD8)
            {
                return cleanup(-2, callback);
            }
            var length = view.byteLength, offset = 2;
            while (offset < length) 
            {
                if (view.getUint16(offset+2, false) <= 8) return cleanup(-1, callback);
                var marker = view.getUint16(offset, false);
                offset += 2;
                if (marker == 0xFFE1) 
                {
                    if (view.getUint32(offset += 2, false) != 0x45786966) 
                    {
                        return cleanup(-1, callback);
                    }
    
                    var little = view.getUint16(offset += 6, false) == 0x4949;
                    offset += view.getUint32(offset + 4, little);
                    var tags = view.getUint16(offset, little);
                    offset += 2;
                    for (var i = 0; i < tags; i++)
                    {
                        if (view.getUint16(offset + (i * 12), little) == 0x0112)
                        {
                            return cleanup(view.getUint16(offset + (i * 12) + 8, little), callback);
                        }
                    }
                }
                else if ((marker & 0xFF00) != 0xFF00)
                {
                    break;
                }
                else
                { 
                    offset += view.getUint16(offset, false);
                }
            }
            return cleanup(-1, callback);
        };
        reader.readAsArrayBuffer(file);
    }

    uploadToS3() {
        var file = document.getElementById("build-project-file-id").files[0],
            reader = new FileReader();  

        reader.readAsDataURL(file);
        reader.onload = (e) => {
            var img = document.createElement("img");
            img.src = e.target.result
            img.onload = () => {
                var canvas = document.createElement("canvas"),
                    ctx = canvas.getContext("2d"),
                    MAX_WIDTH = 2000,
                    MAX_HEIGHT = 2000,
                    width = img.width,
                    height = img.height,
                    orientation = document.getElementById("build-project-file-id").orientation;
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                if (IS_SAMSUNG_BROWSER) {
                    if (4 < orientation && orientation < 9) {
                        canvas.width = height;
                        canvas.height = width;
                    } else {
                        canvas.width = width;
                        canvas.height = height;
                    }
                
                    // transform context before drawing image
                    switch (orientation) {
                        case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
                        case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
                        case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
                        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                        case 6: ctx.transform(0, 1, -1, 0, height, 0); ('case6'); break;
                        case 7: ctx.transform(0, -1, -1, 0, height, width); break;
                        case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
                        default: break;
                    }
                }

                ctx.drawImage(img, 0, 0, width, height);

                let that = this;
                canvas.toBlob( function(blob) { 
                    $.ajax({
                        async: true,
                        crossDomain: true,
                        url: getPresignedURL + (ENV === "prod" ? "2" : "1") + "&email=" + that.state.email + "&layers=" + LAYERS,
                        method: "GET",
                    })
                    .then(json => {
                        var data = new FormData()
                        Object.keys(json.url.fields).forEach(function(key) {
                            data.append(key, json.url.fields[key])
                        })
                        data.append("file", blob)
                        
                        that.projectKey = json.url.fields.key.replace('/master.jpg', "")
                        that.projectURL = json.url.url + (json.url.fields.key).replace("/master.jpg", "")
        
                        return $.ajax({
                            method: 'post',
                            processData: false,
                            contentType: false,
                            cache: false,
                            data: data,
                            enctype: 'multipart/form-data',
                            url: json.url.url,
                        })
                    })
                    .then(() => {
                        that.timer = 0
                        that.timerID = setInterval(()=> that.fetchXML(), 3 * 1000);
                    })
                    .fail(() => {
                        that.disableInput(false)
                        alert("Something went wrong... Try again")
                    })
                    that.disableInput(true)
                },"image/jpeg");
            }   
        }      
        $("#build-project-file-id").val('');  
    }

    fetchXML() {
        this.timer += 1
        $.ajax({
            "async": true,
            "crossDomain": true,
            "url": this.projectURL+ "/project.xml",
            "method": "GET",
        })
        .done(() => {
            clearInterval(this.timerID)
            let project = this.state.project
            let masterURL = this.projectURL + "/master.jpg"

            project.original = masterURL
            for (var i = 0; i < project.icons.length; ++i) {
                project.icons[i].render = null
            }
            this.state.display[0] = masterURL
            this.state.display[1] = masterURL
            this.disableInput(false)
            this.setState({
                showRender: false,
                project: project,
                selectedIdx: -1
            })  
            $("#iconRow").scrollLeft(0)
            document.getElementById("iconRow")
            setTimeout(this.preLoader(0, this.projectURL), 0)
            window.history.replaceState({}, '', window.location.pathname + "?projectId=" + this.projectKey + "&layers=" + LAYERS);
        })
        .fail((err) => {
            console.log("Haven't got it yet")
        })
        if (this.timer >= 60) {
            clearInterval(this.timerID)
            this.disableInput(false)
            alert("Something went wrong... Try again")
        }
    }

    handlePreviousSlide() {
        let idx = this.state.iconViewIdx
        let numDisplay = this.state.numPalettesDisplayed
        let numIcons =  this.state.numIcons
        var newViewIdx;
        newViewIdx = (idx - numDisplay) < 0 ? numIcons - (numDisplay - idx) : idx - numDisplay
        this.setState({
            iconViewIdx: newViewIdx
        })
    }

    handleNextSlide() {
        let idx = this.state.iconViewIdx
        let numDisplay = this.state.numPalettesDisplayed
        let numIcons =  this.state.numIcons
        var newViewIdx;
        newViewIdx = (idx + numDisplay) > numIcons ? 0 + (numIcons - idx) : idx + numDisplay
        this.setState({
            iconViewIdx: newViewIdx
        })
    }

    handleToggle() {
        this.setState({
            showRender: !this.state.showRender
        })
    }

    handleIconClick(index) {
        let displayUrl = this.state.project.icons[index].render
        if (displayUrl === null) {
            // this.disableIcon(index)
            this.fetchRender(index, false)
            this.state.selectedIdx = index
        } else {
            this.state.currentRender = this.state.currentRender === 0 ? 1 : 0
            this.state.display[this.state.currentRender] = displayUrl
            if(this.state.showRender !== true)
                this.state.showRender = true
            this.state.selectedIdx = index
        }
        this.forceUpdate()
    }

    fetchRender(index, background=true) {
        let icon = this.state.project.icons[index]
        let renderURL = renderRootURL + "project_id=" + this.projectKey + "&palette_id=" + PALETTE_VERSION + "/" + icon.groupName + "/" + icon.id + "&width=" + this.state.width
        let currProject = this.projectKey
        let project = this.state.project
        project.icons[index].fetching = true

        return $.ajax({
            "async": true,
            "crossDomain": true,
            "url": renderURL,
            "method": "GET",
        })
        .then(json => {
            if (currProject === this.projectKey) {      // Check if the project has changed
                project.icons[index].render = json.image_url
                project.icons[index].icon = json.image_url
                
                if (index === this.state.selectedIdx) {     // Check if the same render icon is still clicked
                    this.state.showRender = true
                    this.state.currentRender = this.state.currentRender === 0 ? 1 : 0
                    this.state.display[this.state.currentRender] = json.image_url
                }
                this.forceUpdate()
            } 
        })
        .fail(() => {
            //alert("Something went wrong. Render failed... Try again")
        })
        .always(() => {
            //this.enableIcon(index)
            project.icons[index].fetching = false
            if (background === false) {
                this.forceUpdate()
            }
            
        })
    }

    render() {
        return (
            <div id="Main">
                <div id="backgroundImage" className="backgroundImg" style={{backgroundImage: `url(${this.state.project.original})` }} />
                <img id="originalImage" className="originalImg" src={this.state.project.original}/>
                <CSSTransition in={this.state.showRender && !this.state.currentRender} timeout={1000} classNames="img-in" > 
                    <img id="displayImage" className="displayImg" src={this.state.display[0]}/>
                </CSSTransition>
                <CSSTransition in={this.state.showRender && this.state.currentRender} timeout={1000} classNames="img-in" > 
                    <img id="displayImage1" className="displayImg" src={this.state.display[1]}/>
                </CSSTransition>
                {this.createRenderCarousel()}

                <div ref="snav" className="overlay" style={this.state.overlayStyle}>
                    <div id="emailCard" className="jumbotron">
                        <a href="javascript:void(0)" className="closebtn" onClick={this.closeOverlay}>
                            ×
                        </a>
                        <div className = "text-left">
                            <h2>Submit your email to get your free home visualization project!</h2>
                            <div class="input-group mb-3">
                                <input id="userEmail" type="email" class="form-control" aria-describedby="emailHelp" placeholder="Enter email" value={this.state.email} onChange={e => this.setState({email: e.target.value})}/>
                                <div class="input-group-append">
                                    <button id="emailSubmit" class="btn btn-dark" onClick={this.handleEmailSubmit}>Submit</button>
                                </div>
                            </div>
                            <small id="emailHelp" class="form-text text-muted">We'll never share your email with anyone else.</small>
                            <small id="emailHelp" class="form-text text-muted">You'll still be able to view your project in the browser, but we'll email you a link to your project so you can get back to it later!</small>
                        </div>
                    </div>
                </div>
            </div>
            
        );
    }

    createRenderCarousel() {
        let icons = JSON.parse(JSON.stringify(this.state.project.icons)) 
        let numPalettesDisplayed = this.state.numPalettesDisplayed
        let iconsToRender = icons.splice(this.state.iconViewIdx, numPalettesDisplayed)
        if (iconsToRender.length < numPalettesDisplayed) {
            iconsToRender = iconsToRender.concat(icons.splice(0, numPalettesDisplayed - iconsToRender.length))
        }
        return (
            <div id="renderCarousel" class="horizontal-scrollable">
                <div class="fixed-icon-container">
                <div class = "icon-label">Upload</div>

                    <label htmlFor="build-project-file-id" id="new_button" className={this.state.uploading ? 'loader':''} data-toggle="tooltip" data-placement="top" title="Upload a picture of your house to redesign"/>
                    <input hidden id="build-project-file-id" className="form-control-file"  name="file" type="file" accept="image/jpeg, image/png" onChange={this.handleCreate}></input>
                </div>
                
                <div id="iconRow">
                    {/* <div class="icon-container">
                        <svg class="bi bi-caret-left-fill" width="60px" height="60px" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" onClick={this.handlePreviousSlide}>
                            <path d="M3.86 8.753l5.482 4.796c.646.566 1.658.106 1.658-.753V3.204a1 1 0 00-1.659-.753l-5.48 4.796a1 1 0 000 1.506z"/>
                        </svg>
                    </div> */}
                    {this.state.project.icons.map((item, index) => {
                        return (this.createRenderIcon(item))
                    })}
                    {/* <div class="icon-container">
                        <svg class="bi bi-caret-right-fill" width="60px" height="60px" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" onClick={this.handleNextSlide}>
                            <path d="M12.14 8.753l-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 011.659-.753l5.48 4.796a1 1 0 010 1.506z"/>
                        </svg>
                    </div> */}
                </div>

                <div class="fixed-icon-container" data-toggle="tooltip" data-placement="top" title="Toggle before/after">
                <div class = "icon-label">Original</div>

                    <img  className={this.state.showRender === true ? "img-thumbnail-custom" : "img-thumbnail-custom-selected"} src={this.state.project.original} onClick={this.handleToggle}/>
                </div>
            </div>
        )
    }

    createRenderIcon(icon) {
        return (
            <div className={ "icon-container " + (this.state.selectedIdx === icon.idx && icon.fetching === true ? `loader-` : "")}>
                <div class = "icon-label">{icon.name}</div>
                <img 
                    index={icon.idx} 
                    className={(this.state.selectedIdx === icon.idx  && this.state.showRender === true ? "img-thumbnail-custom-selected" : "img-thumbnail-custom") + (icon.fetching === true ? " disabled" : "")} 
                    src={icon.icon} 
                    onClick={() => this.handleIconClick(icon.idx)}
                    />
            </div>
        )
    }
}

function validateEmail(email) {
    const re = /\S+@\S+/;
    return re.test(String(email).toLowerCase());
}

const domContainer = document.querySelector('#react-app');
ReactDOM.render(e(App), domContainer);