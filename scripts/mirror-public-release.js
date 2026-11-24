'use strict';
// Obsolete public release mirroring is permanently retired.
async function mirror(){throw Error('Release publishing has been retired.');}
if(require.main===module)mirror().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={mirror};
