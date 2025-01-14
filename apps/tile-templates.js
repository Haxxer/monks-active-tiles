import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';

export class TileTemplates extends SidebarDirectory {
    constructor(options = {}) {
        super(options);
        this._original = {};
    }

    static get defaultOptions() {
        return {
            id: "tile-template",
            classes: ["tab", "sidebar-tab", "tile-templates"],
            baseApplication: "SidebarTab",
            title: "MonksActiveTiles.TileTemplates",
            template: "templates/sidebar/document-directory.html",
            renderUpdateKeys: ["name", "img", "thumb", "ownership", "sort", "sorting", "folder"],
            scrollY: ["ol.directory-list"],
            dragDrop: [{ dragSelector: ".directory-item", dropSelector: ".directory-list" }],
            filters: [{ inputSelector: 'input[name="search"]', contentSelector: ".directory-list" }],
            contextMenuSelector: ".document",
            tabs: [],
            popOut: true,
            width: 300,
            height: "auto",
        };
    }

    static get documentName() {
        return "Tile";
    }

    static get collection() {
        return setting("tile-templates") || [];
    }

    static get folders() {
        return setting("tile-template-folders") || [];
    }

    initialize() {
        let checkExpanded = function () {
            return game.folders._expanded[this.id] || false;
        }

        // Assign Folders
        this.folders = this.constructor.folders;
        for (let folder of this.folders) {
            folder.expanded = checkExpanded.bind(folder);
        }

        // Assign Documents
        this.documents = this.constructor.collection;

        // Build Tree
        this.tree = this.constructor.setupFolders(this.folders, this.documents);
    }

    //  Need to override this as we don't use proper folders so it won't find them properly
    static _classifyFolderContent(folder, folders, documents, { allowChildren = true } = {}) {
        const sort = folder?.sorting === "a" ? this._sortAlphabetical : this._sortStandard;

        // Partition folders into children and unassigned folders
        const [unassignedFolders, subfolders] = folders.partition(f => allowChildren && (f.folder === folder?._id || f.folder == undefined && folder == undefined));
        subfolders.sort(sort);

        // Partition documents into folder contents and unassigned documents
        const [unassignedDocuments, contents] = documents.partition(e => e.folder === folder?._id || e.folder == undefined && folder == undefined);
        contents.sort(sort);

        // Return the classified content
        return { folders: subfolders, documents: contents, unassignedFolders, unassignedDocuments };
    }

    async getData(options) {
        const context = {
            cssId: this.id,
            cssClass: this.options.classes.join(" "),
            tabName: this.tabName,
            user: game.user
        }
        const cfg = CONFIG["Tile"];
        const cls = cfg.documentClass;
        return foundry.utils.mergeObject(context, {
            tree: this.tree,
            canCreate: true,
            documentCls: cls.documentName.toLowerCase(),
            tabName: cls.metadata.collection,
            sidebarIcon: "fa-solid fa-cube",
            folderIcon: CONFIG.Folder.sidebarIcon,
            label: game.i18n.localize(cls.metadata.label),
            labelPlural: game.i18n.localize(cls.metadata.labelPlural),
            documentPartial: this.constructor.documentPartial,
            folderPartial: this.constructor.folderPartial
        });
    }

    /*
    async _render(...args) {
        await super._render(...args);
        $('.header-actions.action-buttons', this.element).hide();
        this.setPosition({ height: 'auto' });
    }
    */

    /*_toggleFolder(event) {
        super._toggleFolder(event);
        let folder = $(event.currentTarget.parentElement);
    }*/

    _onClickDocumentName(event) {
        let li = event.currentTarget.closest("li");
        let templates = this.constructor.collection;
        const document = templates.find(t => t._id == li.dataset.documentId);
        const options = { width: 320, left: window.innerWidth - 630, top: li.offsetTop };
        return TileTemplates.createDialog(document, options).then(() => {
            this.render(true);
        });
    }

    async _onCreateDocument(event) {
        event.preventDefault();
        event.stopPropagation();
        const button = event.currentTarget;
        const data = { folder: button.dataset.folder };
        const options = { width: 320, left: window.innerWidth - 630, top: button.offsetTop };
        return TileTemplates.createDialog(data, options).then(() => {
            this.render(true);
        });
    }

    static async createDialog(data = {}, { parent = null, pack = null, ...options } = {}) {
        // Collect data
        const documentName = TileDocument.documentName;
        const folders = parent ? [] : this.folders;
        const title = (data.id ? game.i18n.format("DOCUMENT.Update", { type: documentName }) : game.i18n.format("DOCUMENT.Create", { type: documentName }));

        // Render the document creation form
        const html = await renderTemplate("templates/sidebar/document-create.html", {
            folders,
            name: data.name || game.i18n.format("DOCUMENT.New", { type: documentName }),
            folder: data.folder,
            hasFolders: folders.length >= 1,
            hasTypes: false
        });

        // Render the confirmation dialog window
        return Dialog.prompt({
            title: title,
            content: html,
            label: title,
            callback: async (html) => {
                const form = html[0].querySelector("form");
                const fd = new FormDataExtended(form);
                foundry.utils.mergeObject(data, fd.object, { inplace: true });
                if (!data.folder) delete data.folder;

                let templates = duplicate(this.collection);

                if (data.id) {
                    templates.findSplice(t => t._id == data.id, data);
                } else {
                    data.width = canvas.grid.size;
                    data.height = canvas.grid.size;
                    let _data = duplicate(data);
                    let doc = new TileDocument(_data);
                    let template = doc.toObject();
                    template._id = template.id = data.id || randomID();
                    template.name = data.name;
                    template.visible = true;
                    template.folder = data.folder;
                    delete template.img;
                    template.img = template.texture.src;
                    template.thumbnail = template.img || "modules/monks-active-tiles/img/cube.svg";

                    templates.push(template);
                }

                await game.settings.set("monks-active-tiles", "tile-templates", templates);
            },
            rejectClose: false,
            options
        });
    }

    _onCreateFolder(event) {
        let folder = {
            testUserPermission: () => { return game.user.isGM },
            apps: {},
            isOwner: game.user.isGM,
            sorting: "m"
        };
        folder.toObject = () => { return folder; };
        const button = event.currentTarget;
        const options = { top: button.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width, editable: true };
        let fc = new FolderConfig(folder, options).render(true, { editable: true });
        fc._updateObject = async (event, formData) => {
            if (!formData.name?.trim()) formData.name = Folder.implementation.defaultName();
            let folders = this.constructor.folders;
            formData._id = randomID();
            formData.id = formData._id;
            formData.visible = true;
            formData.folder = null;
            folders.push(formData);
            game.settings.set("monks-active-tiles", "tile-template-folders", folders);
            this.render(true);
        }
    }

    _onDragStart(event) {
        if (ui.context) ui.context.close({ animate: false });
        const li = event.currentTarget.closest(".directory-item");
        const documentName = this.constructor.documentName;
        const isFolder = li.classList.contains("folder");
        const doc = isFolder
            ? this.constructor.folders.find(f => f._id == li.dataset.folderId)
            : this.constructor.collection.find(t => t._id == li.dataset.documentId);

        delete doc.x;
        delete doc.y;
        const dragData = { type: isFolder ? "Folder" : "Tile", data: doc };
        if (isFolder) foundry.utils.mergeObject(dragData, { documentName });
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    async _handleDroppedDocument(target, data) {

        // Determine the closest Folder
        const closestFolder = target ? target.closest(".folder") : null;
        if (closestFolder) closestFolder.classList.remove("droptarget");
        let folder = closestFolder ? this.constructor.folders.find(f => f._id == closestFolder.dataset.folderId) : null;

        // Obtain the dropped Document
        const collection = duplicate(this.constructor.collection);
        let document = data.data;
        if (!document) return;

        // Sort relative to another Document
        const sortData = { sortKey: "sort" };
        const isRelative = target && target.dataset.documentId;
        if (isRelative) {
            if (document._id === target.dataset.documentId) return; // Don't drop on yourself
            const targetDocument = collection.find(d => d._id == target.dataset.documentId);
            sortData.target = targetDocument;
            folder = targetDocument.folder;
        }

        // Sort within to the closest Folder
        else sortData.target = null;

        // Determine siblings and perform sort
        sortData.siblings = collection.filter(doc => (doc._id !== document._id) && (doc.folder === folder?.id));
        sortData.updateData = { folder: folder?._id || null };

        let { updateData = {}, ...sortOptions } = sortData;

        const sorting = SortingHelpers.performIntegerSort(document, sortOptions);
        for (let s of sorting) {
            let doc = collection.find(d => d._id == s.target.id);
            foundry.utils.mergeObject(doc, s.update);
            doc.folder = folder?._id || null;
        }

        await game.settings.set("monks-active-tiles", "tile-templates", collection);

        this.render(true);

        return document;
    }

    async _handleDroppedFolder(target, data) {
        if (data.documentName !== this.constructor.documentName) return;
        const folder = data.data;

        let folders = duplicate(this.constructor.folders);

        // Determine the closest folder ID
        const closestFolder = target ? target.closest(".folder") : null;
        if (closestFolder) closestFolder.classList.remove("droptarget");
        const closestFolderId = closestFolder ? closestFolder.dataset.folderId : null;

        // Sort into another Folder
        const sortData = { sortKey: "sort", sortBefore: true };
        const isFolder = target && target.dataset.folderId;
        if (isFolder) {
            const targetFolder = folders.find(f => f.id == target.dataset.folderId);

            // Sort relative to a collapsed Folder
            if (target.classList.contains("collapsed")) {
                sortData.target = targetFolder;
                sortData.parentId = targetFolder.folder?._id;
            }

            // Drop into an expanded Folder
            else {
                if (Number(target.dataset.folderDepth) >= CONST.FOLDER_MAX_DEPTH) return; // Prevent going beyond max depth
                sortData.target = null;
                sortData.parentId = targetFolder._id;
            }
        }

        // Sort relative to existing Folder contents
        else {
            sortData.parentId = closestFolderId;
            sortData.target = closestFolder && closestFolder.classList.contains("collapsed") ? closestFolder : null;
        }

        // Prevent assigning a folder as its own parent
        if (sortData.parentId === folder._id) return;

        // Determine siblings and perform sort
        
        sortData.siblings = folders.filter(f => {
            return (f.folder === sortData.parentId) && (f.id !== folder);
        });
        sortData.updateData = { folder: sortData.parentId };

        let { updateData = {}, ...sortOptions } = sortData;

        const sorting = SortingHelpers.performIntegerSort(folder, sortOptions);
        for (let s of sorting) {
            let fold = folders.find(f => f._id == s.target.id);
            foundry.utils.mergeObject(fold, s.update);
            fold.folder = sortData.parentId || null;
        }

        await game.settings.set("monks-active-tiles", "tile-template-folders", folders);

        this.render(true);
    }

    _getFolderContextOptions() {
        return [
            {
                name: "FOLDER.Edit",
                icon: '<i class="fas fa-edit"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent()[0];
                    const folders = this.constructor.folders;
                    const folder = folders.find(t => t._id == li.dataset.folderId);
                    const options = { top: li.offsetTop, left: window.innerWidth - 310 - FolderConfig.defaultOptions.width };
                    new FolderConfig(folder, options).render(true);
                    //+++ need to override the folder save
                }
            },
            {
                name: "FOLDER.Remove",
                icon: '<i class="fas fa-trash"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent();
                    const folders = duplicate(this.constructor.folders);
                    const folder = folders.find(t => t._id == li.dataset.folderId);
                    return Dialog.confirm({
                        title: `${game.i18n.localize("FOLDER.Remove")} ${folder.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.RemoveWarning")}</p>`,
                        yes: () => {
                            //+++folder.delete({ deleteSubfolders: false, deleteContents: false })
                            folders.findSplice(t => t._id == folder._id);
                            game.settings.set("monks-active-tiles", "tile-template-folders", folders);
                            this.render();
                        },
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720,
                            width: 400
                        }
                    });
                }
            },
            {
                name: "FOLDER.Delete",
                icon: '<i class="fas fa-dumpster"></i>',
                condition: game.user.isGM,
                callback: header => {
                    const li = header.parent();
                    const folders = duplicate(this.constructor.folders);
                    const folder = folders.find(t => t._id == li.dataset.folderId);
                    return Dialog.confirm({
                        title: `${game.i18n.localize("FOLDER.Delete")} ${folder.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>`,
                        yes: () => {
                            //+++folder.delete({ deleteSubfolders: true, deleteContents: true })
                            folders.findSplice(t => t._id == folder._id);
                            game.settings.set("monks-active-tiles", "tile-template-folders", folders);
                            this.render();
                        },
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720,
                            width: 400
                        }
                    });
                }
            }
        ];
    }

   _getEntryContextOptions() {
        return [
            {
                name: "FOLDER.Clear",
                icon: '<i class="fas fa-folder"></i>',
                condition: li => {
                    const document = this.constructor.collection.find(t => t._id == li.data("documentId"));
                    return game.user.isGM && !!document.folder;
                },
                callback: li => {
                    const templates = duplicate(this.constructor.collection);
                    const document = templates.find(t => t._id == li.data("documentId"));
                    document.folder = null;
                    game.settings.set("monks-active-tiles", "tile-templates", templates);
                }
            },
            {
                name: "SIDEBAR.Delete",
                icon: '<i class="fas fa-trash"></i>',
                condition: () => game.user.isGM,
                callback: li => {
                    const templates = duplicate(this.constructor.collection);
                    const document = templates.find(t => t._id == li.data("documentId"));
                    if (!document) return;
                    return Dialog.confirm({
                        title: `${game.i18n.format("DOCUMENT.Delete", { type: "Tile Template" })}: ${document.name}`,
                        content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.format("SIDEBAR.DeleteWarning", { type: "Tile Template" })}</p>`,
                        yes: () => {
                            templates.findSplice(t => t._id == li.data("documentId"));
                            game.settings.set("monks-active-tiles", "tile-templates", templates);
                            new TileTemplates().render(true);
                        },
                        options: {
                            top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                            left: window.innerWidth - 720
                        }
                    });
                }
            },
            {
                name: "SIDEBAR.Export",
                icon: '<i class="fas fa-file-export"></i>',
                condition: li => game.user.isGM,
                callback: li => {
                    const templates = this.constructor.collection;
                    const document = templates.find(t => t._id == li.data("documentId"));
                    const data = deepClone(document);
                    delete data._id;
                    delete data.folder;
                    delete data.sort;
                    delete data.ownership;
                    data.flags["exportSource"] = {
                        world: game.world.id,
                        system: game.system.id,
                        coreVersion: game.version,
                        systemVersion: game.system.version
                    };
                    const filename = `fvtt-tiledata-${document.name.slugify()}.json`;
                    saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
                }
            },
            {
                name: "SIDEBAR.Import",
                icon: '<i class="fas fa-file-import"></i>',
                condition: li => game.user.isGM,
                callback: async (li) => {
                    const templates = duplicate(this.constructor.collection);
                    const document = templates.find(t => t._id == li.data("documentId"));
                    new Dialog({
                        title: `Import Data: ${document.name}`,
                        content: await renderTemplate("templates/apps/import-data.html", {
                            hint1: game.i18n.format("DOCUMENT.ImportDataHint1", { document: TileDocument.documentName }),
                            hint2: game.i18n.format("DOCUMENT.ImportDataHint2", { name: document.name })
                        }),
                        buttons: {
                            import: {
                                icon: '<i class="fas fa-file-import"></i>',
                                label: "Import",
                                callback: async (html) => {
                                    const form = html.find("form")[0];
                                    if (!form.data.files.length) return ui.notifications.error("You did not upload a data file!");
                                    readTextFromFile(form.data.files[0]).then(async (json) => {
                                        const doc = new TileDocument(JSON.parse(json), { strict: true });

                                        // Treat JSON import using the same workflows that are used when importing from a compendium pack
                                        const data = doc.toObject();
                                        delete data._id;
                                        delete data.folder;
                                        delete data.sort;
                                        delete data.ownership;

                                        // Preserve certain fields from the destination document
                                        const preserve = Object.fromEntries(["_id", "sort", "ownership", "name"].map(k => {
                                            return [k, foundry.utils.getProperty(document, k)];
                                        }));
                                        preserve.folder = document.folder?.id;
                                        foundry.utils.mergeObject(data, preserve);

                                        data.visible = true;
                                        delete data.img;
                                        data.img = data.texture.src;
                                        data.id = data._id;
                                        data.thumbnail = data.img || "modules/monks-active-tiles/img/cube.svg";

                                        // Commit the import as an update to this document
                                        templates.findSplice(t => t._id == li.data("documentId"), data);
                                        await game.settings.set("monks-active-tiles", "tile-templates", templates);
                                        ui.notifications.info(game.i18n.format("DOCUMENT.Imported", { document: TileDocument.documentName, name: data.name }));

                                        new TileTemplates().render(true);
                                    });
                                }
                            },
                            no: {
                                icon: '<i class="fas fa-times"></i>',
                                label: "Cancel"
                            }
                        },
                        default: "import"
                    }, {
                        width: 400
                    }).render(true);
                }
            }
        ];
    }
}