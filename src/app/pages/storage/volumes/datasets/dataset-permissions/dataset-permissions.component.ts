import {
  ApplicationRef,
  Component,
  OnDestroy,
  ViewContainerRef
} from '@angular/core';
import {
  FormGroup,
} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import * as _ from 'lodash';
import {Subscription} from 'rxjs';

import { UserService } from '../../../../../services/user.service';
import {RestService, WebSocketService, StorageService, DialogService} from '../../../../../services/';
import {EntityUtils} from '../../../../common/entity/utils';
import {
  FieldConfig
} from '../../../../common/entity/entity-form/models/field-config.interface';
import { T } from '../../../../../translate-marker';

@Component({
  selector : 'app-dataset-permissions',
  template : `<entity-form [conf]="this"></entity-form>`
})
export class DatasetPermissionsComponent implements OnDestroy {

  protected path: string;
  protected mp_path: any;
  protected mp_user: any;
  protected mp_group: any;
  protected mp_mode: any;
  protected mp_mode_en: any;
  protected mp_acl: any;
  protected mp_acl_subscription: any;
  protected mp_recursive: any;
  protected mp_recursive_subscription: any;
  public sub: Subscription;
  public formGroup: FormGroup;
  public data: Object = {};
  public error: string;
  public busy: Subscription;
  protected fs: any = (<any>window).filesize;
  protected route_success: string[] = [ 'storage', 'pools' ];
  protected resource_name = 'storage/permission';

  public fieldConfig: FieldConfig[] = [
    {
      type: 'input',
      name : 'mp_path',
      placeholder : T('Path'),
      readonly: true
    },
    {
      type: 'radio',
      name: 'mp_acl',
      placeholder: T('ACL Type'),
      tooltip: T('Select the type that matches the type of client\
                  accessing the pool/dataset.'),
      options: [{label:'Unix', value: 'unix'},
                {label:'Windows', value: 'windows'},
                {label:'Mac', value: 'mac'}],
    },
    {
      type: 'checkbox',
      name: 'mp_user_en',
      placeholder: T('Apply User'),
      tooltip: T('Set to apply changes to the user.'),
      value: true
    },
    {
      type: 'combobox',
      name: 'mp_user',
      placeholder: T('User'),
      tooltip: T('Select the user to control the pool/dataset. Users\
                  manually created or imported from a directory service\
                  will appear in the drop-down menu.'),
      options: [],
      searchOptions: [],
      parent: this,
      updater: this.updateUserSearchOptions,
    },
    {
      type: 'checkbox',
      name: 'mp_group_en',
      placeholder: T('Apply Group'),
      tooltip: T('Set to apply changes to the group'),
      value: true
    },
    {
      type: 'combobox',
      name: 'mp_group',
      placeholder: T('Group'),
      tooltip: T('Select the group to control the pool/dataset. Groups\
                  manually created or imported from a directory service\
                  will appear in the drop-down menu.'),
      options: [],
      searchOptions: [],
      parent: this,
      updater: this.updateGroupSearchOptions,
    },
    {
      type: 'checkbox',
      name: 'mp_mode_en',
      placeholder: T('Apply Mode'),
      tooltip: T('Set to apply changes to the mode'),
      value: true
    },
    {
      type: 'permissions',
      name: 'mp_mode',
      placeholder: T('Mode'),
      tooltip: T('Only applies to Unix or Mac permission types.'),
      isHidden: false
    },
    {
      type: 'checkbox',
      name: 'mp_recursive',
      placeholder: T('Apply permissions recursively'),
      tooltip: T('Apply permissions recursively to all directories\
                  and files within the current dataset'),
      value: false
    }
  ];

  constructor(protected router: Router, protected route: ActivatedRoute,
              protected aroute: ActivatedRoute, protected rest: RestService,
              protected ws: WebSocketService, protected userService: UserService,
              protected storageService: StorageService, protected dialog: DialogService) {}

  preInit(entityEdit: any) {
    entityEdit.isNew = true; // remove me when we find a way to get the permissions
    this.sub = this.aroute.params.subscribe(params => {
      this.path = '/mnt/' + params['path'];
      this.mp_path = _.find(this.fieldConfig, {name:'mp_path'});
      this.mp_path.value = this.path;
    });

    this.userService.listAllUsers().subscribe(res => {
      let users = [];
      let items = res.data.items;
      for (let i = 0; i < items.length; i++) {
        users.push({label: items[i].label, value: items[i].id});
      }
      this.mp_user = _.find(this.fieldConfig, {'name' : 'mp_user'});
      this.mp_user.options = users;
    });

    this.userService.listAllGroups().subscribe(res => {
      let groups = [];
      let items = res.data.items;
      for (let i = 0; i < items.length; i++) {
        groups.push({label: items[i].label, value: items[i].id});
      }
      this.mp_group = _.find(this.fieldConfig, {'name' : 'mp_group'});
        this.mp_group.options = groups;
    });
    this.mp_mode = _.find(this.fieldConfig, {'name' : "mp_mode"});
    this.mp_mode_en = _.find(this.fieldConfig, {'name': 'mp_mode_en'});
  }

  afterInit(entityEdit: any) {
    this.storageService.filesystemStat(this.path).subscribe(res => {
      entityEdit.formGroup.controls['mp_mode'].setValue(res.mode.toString(8).substring(2,5));
      entityEdit.formGroup.controls['mp_user'].setValue(res.user);
      entityEdit.formGroup.controls['mp_group'].setValue(res.group);
      this.mp_acl = entityEdit.formGroup.controls['mp_acl'];
      this.mp_acl.setValue(res.acl);
      if (res.acl === 'windows') {
        this.mp_mode['isHidden'] = true;
        this.mp_mode_en['isHidden'] = true;
      }
      this.mp_acl_subscription = this.mp_acl.valueChanges.subscribe((acl) => {
        if (acl === 'windows') {
          this.mp_mode['isHidden'] = true;
          this.mp_mode_en['isHidden'] = true;
        } else {
          this.mp_mode['isHidden'] = false;
          this.mp_mode_en['isHidden'] = false;
        }
      });
    });
    this.mp_recursive = entityEdit.formGroup.controls['mp_recursive'];
    this.mp_recursive_subscription = this.mp_recursive.valueChanges.subscribe((value) => {
      if (value === true) {
        this.dialog.confirm(T("Warning"), T("Setting permissions recursively will affect this directory and any others below it. This might make data inaccessible."))
        .subscribe((res) => {
          if (!res) {
            this.mp_recursive.setValue(false);
          }
        });
      }
    });
  }

  ngOnDestroy() {
    this.mp_acl_subscription.unsubscribe();
    this.mp_recursive_subscription.unsubscribe();
  }

  beforeSubmit(data) {
    if (data.mp_acl === "windows") {
      delete data['mp_mode'];
      delete data['mp_mode_en'];
    }
  }

  updateGroupSearchOptions(value = "", parent) {
    parent.userService.listAllGroups(value).subscribe(res => {
      let groups = [];
      let items = res.data.items;
      for (let i = 0; i < items.length; i++) {
        groups.push({label: items[i].label, value: items[i].id});
      }
        parent.mp_group.searchOptions = groups;
    });
  }

  updateUserSearchOptions(value = "", parent) {
    parent.userService.listAllUsers(value).subscribe(res => {
      let users = [];
      let items = res.data.items;
      for (let i = 0; i < items.length; i++) {
        users.push({label: items[i].label, value: items[i].id});
      }
      parent.mp_user.searchOptions = users;
    });
  }
}
