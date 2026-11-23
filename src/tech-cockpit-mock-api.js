'use strict';
// TechCockpit mock contract. Pure, in-memory, 100% fictional data. No connections,
// credentials, real authentication, database calls, or external network requests.
// This factory is serialized into an ephemeral Vite config, not app source.
function createTechCockpitMockApi() {
  const id=n=>'80000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const ref=(n,name)=>({id:id(n),name});
  const p1={...ref(91,'Enterprise Applications'),active:true,version:1};
  const p2={...ref(92,'Shared Platforms'),active:true,version:1};
  const capabilities=[
    { ...ref(201,'Customer Management'),parentId:null,level:1,description:'Simulated customer capabilities',applicationCount:2,missingSince:null },
    { ...ref(202,'Payments and Billing'),parentId:null,level:1,description:'Simulated payments capabilities',applicationCount:1,missingSince:null },
    { ...ref(203,'Technology Operations'),parentId:null,level:1,description:'Simulated operations capabilities',applicationCount:2,missingSince:null }
  ];
  const apps=[
    {id:id(1),number:'APP-MOCK-001',name:'Customer Relationship Hub',installStatus:'In Production',criticalityRating:'2 - High',businessUnit:'Digital',timeRating:'invest',capability:{id:id(201),name:'Customer Management',level:1},capabilityMismatch:false,portfolios:[{id:p1.id,name:p1.name}],missingSince:null},
    {id:id(2),number:'APP-MOCK-002',name:'Payment Orchestration',installStatus:'In Production',criticalityRating:'1 - Critical',businessUnit:'Finance',timeRating:'migrate',capability:{id:id(202),name:'Payments and Billing',level:1},capabilityMismatch:false,portfolios:[{id:p1.id,name:p1.name}],missingSince:null},
    {id:id(3),number:'APP-MOCK-003',name:'Employee Self-Service',installStatus:'In Production',criticalityRating:'3 - Medium',businessUnit:'People',timeRating:'tolerate',capability:{id:id(203),name:'Technology Operations',level:1},capabilityMismatch:false,portfolios:[{id:p2.id,name:p2.name}],missingSince:null},
    {id:id(4),number:'APP-MOCK-004',name:'Analytics Workbench',installStatus:'Under Development',criticalityRating:'2 - High',businessUnit:'Technology',timeRating:'invest',capability:{id:id(203),name:'Technology Operations',level:1},capabilityMismatch:false,portfolios:[{id:p2.id,name:p2.name}],missingSince:null},
    {id:id(5),number:'APP-MOCK-005',name:'Customer Service Portal',installStatus:'In Production',criticalityRating:'3 - Medium',businessUnit:'Digital',timeRating:'invest',capability:{id:id(201),name:'Customer Management',level:1},capabilityMismatch:false,portfolios:[{id:p1.id,name:p1.name}],missingSince:null}
  ];
  const services=[
    {id:id(301),number:'SVC-MOCK-001',name:'Customer API',kind:'application',environment:'Production',operationalStatus:'Operational',missingSince:null},
    {id:id(302),number:'SVC-MOCK-002',name:'Payments API',kind:'application',environment:'Production',operationalStatus:'Operational',missingSince:null},
    {id:id(303),number:'SVC-MOCK-003',name:'Analytics API',kind:'application',environment:'Development',operationalStatus:'Operational',missingSince:null},
    {id:id(304),number:'SVC-MOCK-004',name:'Customer Support',kind:'business',environment:'Production',operationalStatus:'Operational',missingSince:null}
  ];
  const standards=[
    {id:id(501),name:'PostgreSQL',product:'PostgreSQL Database',manufacturer:'PostgreSQL Global Development Group',status:'Approved',standardCategory:'Database',functionalCategory:'Data Management',missingSince:null},
    {id:id(502),name:'React',product:'React',manufacturer:'Meta',status:'Approved',standardCategory:'Frontend',functionalCategory:'Application Platform',missingSince:null},
    {id:id(503),name:'NestJS',product:'NestJS',manufacturer:'NestJS',status:'Approved',standardCategory:'Backend',functionalCategory:'Application Platform',missingSince:null}
  ];
  const models=[
    {id:id(401),name:'PostgreSQL 15',product:'PostgreSQL',productVersion:'15',manufacturer:'PostgreSQL Global Development Group',productStandard:{id:id(501),name:'PostgreSQL',status:'Approved'},missingSince:null},
    {id:id(402),name:'React 19',product:'React',productVersion:'19',manufacturer:'Meta',productStandard:{id:id(502),name:'React',status:'Approved'},missingSince:null},
    {id:id(403),name:'NestJS 12',product:'NestJS',productVersion:'12',manufacturer:'NestJS',productStandard:{id:id(503),name:'NestJS',status:'Approved'},missingSince:null}
  ];
  const servers=[{id:id(601),name:'Mock Application Host 01',missingSince:null},{id:id(602),name:'Mock API Host 01',missingSince:null}];
  const domain={id:id(701),name:'Enterprise Technology',active:true,version:1,subdomains:[{id:id(702),name:'Application Platform',active:true,version:1,applicationCount:3}]};
  const layers=[{id:id(801),name:'Application',position:1,active:true,version:1},{id:id(802),name:'Data',position:2,active:true,version:1},{id:id(803),name:'Infrastructure',position:3,active:true,version:1}];
  const initiative={id:id(901),name:'Modernize Customer Platform',description:'Mock roadmap programme',rationale:'Demonstrate planning without real data',status:'proposed',startDate:'2026-11-01',endDate:'2027-06-30',owner:null,estimatedCost:'0',capabilities:[ref(201,'Customer Management')],actions:[],restricted:[],canEdit:true,version:1};
  const notifications=[
    {id:id(1001),type:'approval.task.assigned',params:{workflow:'Mock design review'},link:'/approvals',readAt:null,createdAt:'2026-11-23T00:00:00.000Z'}
  ];
  const source=null, txt=null;
  const success=(body,status=200,headers={})=>({status,body,headers});
  const problem=(status,title,detail)=>success({title,status,detail},status);
  const missing=()=>problem(404,'Mock record not found','No synthetic record exists with this ID.');
  const denied=()=>problem(501,'Mock endpoint not implemented','No synthetic handler was defined for this route. No real backend was contacted.');
  const page=(items,query)=>{
    const page=Math.max(1,parseInt(query.get('page')||'1',10)||1);
    const pageSize=Math.min(100,Math.max(1,parseInt(query.get('pageSize')||'25',10)||25));
    return {items:items.slice((page-1)*pageSize,page*pageSize),page,pageSize,total:items.length};
  };
  const filter=(items,query)=>{
    const q=(query.get('q')||'').trim().toLowerCase();
    return items.filter(item=>{
      if(q && !(item.name||'').toLowerCase().includes(q) && !(item.number||'').toLowerCase().includes(q))return false;
      for(const [key,value] of query.entries()){
        if(!value||['q','page','pageSize','missing'].includes(key))continue;
        if(key==='capabilityId' && item.capability?.id!==value)return false;
        if(key==='portfolioId' && !item.portfolios?.some(p=>p.id===value))return false;
        if(key==='kind' && item.kind!==value)return false;
        if(['installStatus','criticalityRating','businessUnit','environment','status','timeRating'].includes(key) && String(item[key]??'')!==value)return false;
      }
      return query.get('missing')!=='true'||!!item.missingSince;
    });
  };
  const list=(items,query)=>success(page(filter(items,query),query));
  const capRefs=cap=>cap?[ref(cap.id===id(201)?201:cap.id===id(202)?202:203,cap.name)]:[];
  const applicationDetail=a=>({
    id:a.id,version:1,snSysId:'synthetic-'+a.number,number:a.number,name:a.name,displayName:a.name,shortName:a.name,
    description:'Synthetic application record for ATGV local UI preview only.',installStatus:a.installStatus,
    operationalStatus:'Operational',recordStatus:'Active',installType:'Application',groupOrLocal:'Group',businessUnit:a.businessUnit,
    ownedBusinessUnit:a.businessUnit,servingBusinessUnits:a.businessUnit,criticalityRating:a.criticalityRating,
    bcmCriticality:txt,rto:txt,rpo:txt,recoveryTimeCapability:txt,snUpdatedOn:txt,
    people:{itApplicationOwner:txt,applicationLead:txt,applicationManager:txt},
    costs:{licence:txt,internalSupport:txt,externalSupport:txt,infraOnPremises:txt,infraCloud:txt},
    capability:{path:capRefs(a.capability),mismatch:false,fields:{group:txt,family:txt,category:txt}},
    portfolios:a.portfolios,subdomains:[],
    trm:{timeRating:a.timeRating,timeRationale:'Synthetic assessment',functionalFit:4,technicalFit:4,
      plannedGoLive:null,plannedPhaseOut:null,plannedRetirement:null,vendorEndOfSupport:null},
    services:services.slice(0,1).map(s=>({...s,usedFor:'Demonstration',businessServices:[],servers:[],software:[]})),
    missingSince:null,restricted:[],canEdit:true,canSetPortfolios:true,canSetDomains:true,source
  });
  const serviceDetail=s=>({
    ...s,snSysId:'synthetic-'+s.number,displayName:s.name,description:'Synthetic service used by the mock UI',
    usedFor:'Demonstration',serviceClassification:'Internal',portfolioStatus:'Active',businessCriticality:txt,
    dataClassification:txt,customerPiiData:txt,creditCardData:txt,healthcareData:txt,priceSensitiveData:txt,
    networkFacing:txt,rto:txt,rpo:txt,applicationSecurityRating:txt,hostingProvider:txt,ownedBusinessUnit:txt,
    ownedBy:txt,snUpdatedOn:txt,applications:[ref(1,apps[0].name)],businessServices:[],applicationServices:[],servers:[],software:[],
    restricted:[],source
  });
  const modelDetail=m=>({...m,snSysId:'synthetic-'+m.id,productType:txt,modelCategory:txt,productStandardName:m.productStandard?.name||null,
    services:[],applications:[ref(1,apps[0].name)],source});
  const standardDetail=s=>({...s,snSysId:'synthetic-'+s.id,productType:txt,description:txt,
    cloudServiceType:txt,vmOnPremises:txt,vmCloud:txt,containerOnPremises:txt,containerCloud:txt,allowedOnDesktop:txt,
    aiControls:txt,remarks:txt,lastStatusDate:txt,addedDate:txt,assessmentLink:txt,
    softwareModels:models.filter(m=>m.productStandard?.id===s.id).map(m=>ref(Number(m.id.slice(-12)),m.name)),source});
  const person=ref(100,'Mock Preview User');
  const me=()=>{
    const accessExpiresAt=new Date(Date.now()+15*60*1000).toISOString();
    return {user:{id:person.id,username:'atgv.mock',email:'mock@preview.invalid',firstName:'Demo',lastName:'User',isExternal:false},
      roles:['ATGV Mock Viewer'],permissions:['trm:application:read','trm:roadmap:read','trm:roadmap:manage','trm:application:manage',
        'trm:domain:manage','trm:layer:manage','portfolio:portfolio:manage','approvals:instance:read','approvals:task:act'],
      isSystemAdmin:false,authMethod:'session',session:{accessExpiresAt,expiresAt:new Date(Date.now()+4*60*60*1000).toISOString()}};
  };
  function respond(request){
    const method=String(request.method||'GET').toUpperCase();
    const pathname=String(request.pathname||'/');
    const query=request.query instanceof URLSearchParams?request.query:new URLSearchParams(request.query||'');
    const body=request.body&&typeof request.body==='object'?request.body:{};
    if(!pathname.startsWith('/api/v1/'))return null;
    if(method==='GET'&&pathname==='/api/v1/me')return success(me());
    if(method==='GET'&&pathname==='/api/v1/health')return success({status:'mock',database:'simulated',warning:'NOT A REAL DATABASE OR BACKEND'});
    if(method==='GET'&&pathname==='/api/v1/auth/saml/login'){
      const target=query.get('returnTo')||'/';
      const local=target.startsWith('/')&&!target.startsWith('//')&&!target.includes('\\')?target:'/';
      return success(null,302,{location:local});
    }
    if(method==='GET'&&pathname==='/api/v1/auth/refused-username')return success({username:null});
    if(method==='POST'&&pathname==='/api/v1/auth/refresh')return success(me().session);
    if(method==='POST'&&pathname==='/api/v1/auth/logout')return success(null,204);
    if(method==='GET'&&pathname==='/api/v1/me/notifications/unread-count')return success({unread:notifications.filter(n=>!n.readAt).length});
    if(method==='GET'&&pathname==='/api/v1/me/notifications')return success({...page(notifications.filter(n=>query.get('unread')!=='true'||!n.readAt),query),unread:notifications.filter(n=>!n.readAt).length});
    if(method==='POST'&&pathname==='/api/v1/me/notifications/read-all'){
      const count=notifications.filter(n=>!n.readAt).length;notifications.forEach(n=>{n.readAt=new Date().toISOString();});return success({updated:count});
    }
    const notification=pathname.match(/^\/api\/v1\/me\/notifications\/([^/]+)\/read$/);
    if(method==='POST'&&notification){const n=notifications.find(x=>x.id===notification[1]);if(!n)return missing();n.readAt=new Date().toISOString();return success(n);}
    if(method==='GET'&&pathname==='/api/v1/trm/facets')return success({
      installStatuses:[...new Set(apps.map(a=>a.installStatus))],criticalityRatings:[...new Set(apps.map(a=>a.criticalityRating))],
      businessUnits:[...new Set(apps.map(a=>a.businessUnit))],environments:['Production','Development'],productStandardStatuses:['Approved']});
    if(method==='GET'&&pathname==='/api/v1/trm/capabilities')return success({items:capabilities});
    if(method==='GET'&&pathname==='/api/v1/trm/domains')return success({items:[domain]});
    if(method==='GET'&&pathname==='/api/v1/trm/layers')return success({layers,mappings:[],unmappedCategories:['Database','Frontend','Backend']});
    if(method==='GET'&&pathname==='/api/v1/trm/landscape')return success({applications:apps.map(a=>({
      id:a.id,name:a.name,number:a.number,installStatus:a.installStatus,criticalityRating:a.criticalityRating,
      timeRating:a.timeRating,functionalFit:4,technicalFit:4,capabilityId:a.capability?.id??null,
      capabilityMismatch:false,subdomainIds:[],plannedGoLive:null,plannedPhaseOut:null,plannedRetirement:null,
      vendorEndOfSupport:null,missingSince:null}))});
    if(method==='GET'&&pathname==='/api/v1/trm/technology')return success({
      layers:layers.map(l=>({id:l.id,name:l.name,position:l.position})),
      standards:standards.map(s=>({id:s.id,name:s.name,status:s.status,standardCategory:s.standardCategory,
        layerId:s.standardCategory==='Database'?layers[1].id:layers[0].id,modelCount:models.filter(m=>m.productStandard?.id===s.id).length,
        applicationCount:1,missingSince:null}))});
    const usage=pathname.match(/^\/api\/v1\/trm\/technology\/standards\/([^/]+)$/);
    if(method==='GET'&&usage)return success({models:models.filter(m=>m.productStandard?.id===usage[1]).map(m=>({id:m.id,name:m.name,productVersion:m.productVersion,applications:[ref(1,apps[0].name)]}))});
    if(method==='GET'&&pathname==='/api/v1/portfolios')return success({items:[p1,p2]});
    if(method==='GET'&&pathname==='/api/v1/trm/initiatives')return list([{id:initiative.id,name:initiative.name,status:initiative.status,
      startDate:initiative.startDate,endDate:initiative.endDate,owner:initiative.owner,actionCounts:{introduce:0,enhance:0,replace:0,retire:0}}],query);
    if(method==='GET'&&pathname==='/api/v1/trm/planned-applications')return success({items:[]});
    if(method==='GET'&&pathname==='/api/v1/trm/sync-runs')return success(page([],query));
    if(method==='GET'&&pathname==='/api/v1/trm/missing-records/summary')return success({items:['applications','services','capabilities','productStandards','softwareModels','servers'].map(recordType=>({recordType,count:0})),total:0});
    if(method==='GET'&&pathname==='/api/v1/trm/missing-records')return success(page([],query));
    if(method==='GET'&&pathname==='/api/v1/approval-tasks')return success({items:[]});
    if(method==='GET'&&pathname==='/api/v1/approval-instances')return success(page([],query));
    if(method==='GET'&&pathname==='/api/v1/me/approval-decisions')return success(page([],query));
    if(method==='GET'&&pathname==='/api/v1/me/delegations')return success({items:[]});
    if(method==='GET'&&pathname==='/api/v1/approval-workflows')return success({items:[]});
    if(method==='GET'&&pathname==='/api/v1/approval-rule-sets')return success({items:[]});
    if(method==='GET'&&pathname==='/api/v1/trm/applications')return list(apps,query);
    if(method==='GET'&&pathname==='/api/v1/trm/services')return list(services,query);
    if(method==='GET'&&pathname==='/api/v1/trm/software-models')return list(models,query);
    if(method==='GET'&&pathname==='/api/v1/trm/product-standards')return list(standards,query);
    if(method==='GET'&&pathname==='/api/v1/trm/servers')return list(servers,query);
    const detail=pathname.match(/^\/api\/v1\/trm\/(applications|services|capabilities|software-models|product-standards|servers|initiatives)\/([^/]+)$/);
    if(method==='GET'&&detail){const resource=detail[1],recordId=detail[2];
      if(resource==='applications'){const x=apps.find(a=>a.id===recordId);return x?success(applicationDetail(x)):missing();}
      if(resource==='services'){const x=services.find(s=>s.id===recordId);return x?success(serviceDetail(x)):missing();}
      if(resource==='capabilities'){const x=capabilities.find(c=>c.id===recordId);return x?success({id:x.id,snSysId:'mock-'+x.id,name:x.name,
        description:x.description,operationalStatus:'Operational',parentName:null,level:x.level,path:[ref(Number(x.id.slice(-12)),x.name)],
        children:[],applications:apps.filter(a=>a.capability?.id===x.id),missingSince:null,source}):missing();}
      if(resource==='software-models'){const x=models.find(m=>m.id===recordId);return x?success(modelDetail(x)):missing();}
      if(resource==='product-standards'){const x=standards.find(s=>s.id===recordId);return x?success(standardDetail(x)):missing();}
      if(resource==='servers'){const x=servers.find(s=>s.id===recordId);return x?success({...x,services:[{id:services[0].id,name:services[0].name,environment:'Production',applications:[ref(1,apps[0].name)]}]}):missing();}
      if(resource==='initiatives')return recordId===initiative.id?success(initiative):missing();
    }
    // Allow changes only to isolated in-memory fixtures, never to actual project data.
    if(method==='PATCH'&&detail&&detail[1]==='applications'){
      const x=apps.find(a=>a.id===detail[2]);if(!x)return missing();
      if(body.timeRating!==undefined)x.timeRating=body.timeRating;
      return success(applicationDetail(x));
    }
    const portfolios=pathname.match(/^\/api\/v1\/trm\/applications\/([^/]+)\/portfolios$/);
    if(method==='PUT'&&portfolios){const x=apps.find(a=>a.id===portfolios[1]);if(!x)return missing();
      x.portfolios=[p1,p2].filter(p=>Array.isArray(body.portfolioIds)&&body.portfolioIds.includes(p.id)).map(p=>({id:p.id,name:p.name}));
      return success(applicationDetail(x));
    }
    // The unsupported request is never passed through to the real NestJS process.
    return denied();
  }
  return respond;
}
module.exports={createTechCockpitMockApi};
